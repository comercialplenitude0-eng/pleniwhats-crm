import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendToMeta, type MetaPayload } from "@/lib/whatsapp-send.server";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 6;

// Backoff: 1s, 5s, 30s, 2m, 10m, 1h
function backoffSeconds(attempt: number): number {
  const ladder = [1, 5, 30, 120, 600, 3600];
  return ladder[Math.min(attempt, ladder.length - 1)];
}

export const Route = createFileRoute("/api/public/hooks/process-outbound-queue")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();

        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("outbound_queue")
          .select("id, message_id, account_id, payload, attempts")
          .eq("status", "queued")
          .lte("next_attempt_at", new Date().toISOString())
          .order("created_at", { ascending: true })
          .limit(BATCH_SIZE);

        if (selErr) {
          return new Response(
            JSON.stringify({ ok: false, error: selErr.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const items = candidates ?? [];
        let sent = 0;
        let failed = 0;
        let retried = 0;

        for (const it of items) {
          // Lock otimista
          const { data: locked } = await supabaseAdmin
            .from("outbound_queue")
            .update({ status: "sending", attempts: it.attempts + 1 })
            .eq("id", it.id)
            .eq("status", "queued")
            .select("id")
            .maybeSingle();
          if (!locked) continue;

          const result = await sendToMeta(
            it.payload as unknown as MetaPayload,
            it.account_id,
          );

          if (result.wamid !== null || (!result.transientError && !result.permanentError)) {
            // sucesso
            await supabaseAdmin
              .from("outbound_queue")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                wamid: result.wamid,
                last_error: null,
              })
              .eq("id", it.id);
            await supabaseAdmin
              .from("messages")
              .update({ status: "sent", wamid: result.wamid })
              .eq("id", it.message_id);
            sent++;
            continue;
          }

          const errMsg = result.transientError ?? result.permanentError ?? "unknown error";
          const nextAttempts = it.attempts + 1;
          const isFinal =
            !!result.permanentError || nextAttempts >= MAX_ATTEMPTS;

          if (isFinal) {
            await supabaseAdmin
              .from("outbound_queue")
              .update({ status: "failed", last_error: errMsg.slice(0, 1000) })
              .eq("id", it.id);
            await supabaseAdmin
              .from("messages")
              .update({ status: "failed" })
              .eq("id", it.message_id);
            failed++;
          } else {
            await supabaseAdmin
              .from("outbound_queue")
              .update({
                status: "queued",
                last_error: errMsg.slice(0, 1000),
                next_attempt_at: new Date(
                  Date.now() + backoffSeconds(nextAttempts) * 1000,
                ).toISOString(),
              })
              .eq("id", it.id);
            retried++;
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            sent,
            failed,
            retried,
            took_ms: Date.now() - startedAt,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
