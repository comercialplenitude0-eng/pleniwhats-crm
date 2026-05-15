import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildMetaPayload,
  normalizePhone,
} from "@/lib/whatsapp-send.server";

const SendInput = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(["text", "image", "document", "audio"]),
  content: z.string().nullable().optional(),
  mediaUrl: z.string().url().nullable().optional(),
  filename: z.string().nullable().optional(),
});

/**
 * Enfileira uma mensagem para envio. NÃO chama a Meta na request do usuário —
 * o cron `process-outbound-queue` faz isso com retry/backoff.
 *
 * Fluxo:
 *  1) Cria a `messages` com status='queued' (UI já mostra como "enviando")
 *  2) Insere `outbound_queue` com payload pronto
 *  3) Retorna 200 imediato. UX <100ms mesmo quando a Meta está lenta.
 */
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };

    const { data: conv, error: cErr } = await supabaseAdmin
      .from("conversations")
      .select("id, contact_phone, account_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (cErr || !conv) throw new Error("Conversa não encontrada");

    const to = normalizePhone(conv.contact_phone);
    if (!to) throw new Error("Telefone do contato inválido");

    // Valida formato do payload antes de enfileirar
    const payload = buildMetaPayload(
      to,
      data.type,
      data.content,
      data.mediaUrl,
      data.filename,
    );

    // 1) Cria a mensagem outbound em estado 'queued'
    const { data: msg, error: insErr } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        account_id: conv.account_id ?? null,
        direction: "outbound",
        type: data.type,
        content: data.content ?? null,
        media_url: data.mediaUrl ?? null,
        sender_id: userId,
        status: "queued",
      })
      .select("id")
      .single();
    if (insErr || !msg) throw new Error(insErr?.message ?? "Falha ao criar mensagem");

    // 2) Enfileira o envio
    const { error: qErr } = await supabaseAdmin.from("outbound_queue").insert({
      message_id: msg.id,
      conversation_id: data.conversationId,
      account_id: conv.account_id ?? null,
      payload,
    });
    if (qErr) {
      // Rollback do status da mensagem
      await supabaseAdmin
        .from("messages")
        .update({ status: "failed" })
        .eq("id", msg.id);
      throw new Error(qErr.message);
    }

    return { ok: true, messageId: msg.id };
  });
