import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  verifyMetaSignature,
  findVerifyTokenMatch,
} from "@/lib/whatsapp-webhook-processor.server";

type AnyObj = Record<string, any>;

export const Route = createFileRoute("/api/public/hooks/whatsapp")({
  server: {
    handlers: {
      // Verificação inicial do webhook
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token && (await findVerifyTokenMatch(token))) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },

      // POST: só valida assinatura, enfileira e responde 200 imediatamente.
      // Processamento real fica no cron /api/public/hooks/process-webhook-queue.
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: AnyObj = {};
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const firstChange = (payload?.entry ?? [])[0]?.changes?.[0]?.value as AnyObj | undefined;
        const phoneNumberId: string | null = firstChange?.metadata?.phone_number_id ?? null;
        const sig = request.headers.get("x-hub-signature-256");

        const ok = await verifyMetaSignature(raw, sig, phoneNumberId);
        if (!ok) return new Response("invalid signature", { status: 401 });

        // Tenta capturar wamid principal (se houver) para diagnóstico
        const firstMsg = (firstChange?.messages ?? [])[0] as AnyObj | undefined;
        const wamid: string | null = firstMsg?.id ?? null;

        const { error } = await supabaseAdmin.from("webhook_events").insert({
          provider: "whatsapp",
          payload,
          signature: sig,
          phone_number_id: phoneNumberId,
          wamid,
        });
        if (error) {
          console.error("[whatsapp webhook] enqueue:", error.message);
          // Mesmo se falhar o enqueue, respondemos 200 para a Meta não floodar.
          // Logamos para investigar.
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
