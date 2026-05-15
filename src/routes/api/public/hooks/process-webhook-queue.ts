import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processWhatsappPayload } from "@/lib/whatsapp-webhook-processor.server";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

// Backoff exponencial em segundos: 5s, 30s, 2m, 10m, 1h
function backoffSeconds(attempt: number): number {
  const ladder = [5, 30, 120, 600, 3600];
  return ladder[Math.min(attempt, ladder.length - 1)];
}

export const Route = createFileRoute("/api/public/hooks/process-webhook-queue")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();

        // Pega lote de eventos pendentes prontos para processar.
        // (No futuro pode virar SELECT ... FOR UPDATE SKIP LOCKED via RPC; por ora
        // marcamos status='processing' atomicamente para evitar concorrência.)
        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("webhook_events")
          .select("id, payload, attempts")
          .eq("status", "pending")
          .lte("next_attempt_at", new Date().toISOString())
          .order("received_at", { ascending: true })
          .limit(BATCH_SIZE);

        if (selErr) {
          return new Response(
            JSON.stringify({ ok: false, error: selErr.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const events = candidates ?? [];
        let processed = 0;
        let failed = 0;

        for (const ev of events) {
          // Lock otimista: só processa se conseguir mover de pending -> processing
          const { data: locked } = await supabaseAdmin
            .from("webhook_events")
            .update({ status: "processing", attempts: ev.attempts + 1 })
            .eq("id", ev.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();
          if (!locked) continue;

          try {
            await processWhatsappPayload(ev.payload as Record<string, any>);
            await supabaseAdmin
              .from("webhook_events")
              .update({
                status: "done",
                processed_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", ev.id);
            processed++;
          } catch (e) {
            const msg = (e as Error).message ?? String(e);
            const nextAttempts = ev.attempts + 1;
            const isFinal = nextAttempts >= MAX_ATTEMPTS;
            await supabaseAdmin
              .from("webhook_events")
              .update({
                status: isFinal ? "failed" : "pending",
                last_error: msg.slice(0, 1000),
                next_attempt_at: new Date(
                  Date.now() + backoffSeconds(nextAttempts) * 1000,
                ).toISOString(),
              })
              .eq("id", ev.id);
            failed++;
            console.error("[webhook-queue] process fail:", msg);
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            processed,
            failed,
            took_ms: Date.now() - startedAt,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
