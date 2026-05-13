import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";

function normalizePhone(p: string) {
  return (p ?? "").replace(/\D/g, "");
}

type MetaPayload = Record<string, unknown> & { to: string; type: string };

async function sendToMeta(payload: MetaPayload): Promise<string | null> {
  const { data: cfg } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("access_token, phone_number_id")
    .eq("id", true)
    .maybeSingle();
  const token = cfg?.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = cfg?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error(
      "WhatsApp não configurado. Cadastre as credenciais Meta em Configurações → WhatsApp.",
    );
  }
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    },
  );
  const json = await res.json().catch(() => ({} as { messages?: Array<{ id?: string }>; error?: { message?: string } }));
  if (!res.ok) {
    const msg = json?.error?.message ?? `Meta API ${res.status}`;
    throw new Error(msg);
  }
  return json?.messages?.[0]?.id ?? null;
}

const SendInput = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(["text", "image", "document", "audio"]),
  content: z.string().nullable().optional(),
  mediaUrl: z.string().url().nullable().optional(),
  filename: z.string().nullable().optional(),
});

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };

    const { data: conv, error: cErr } = await supabaseAdmin
      .from("conversations")
      .select("id, contact_phone")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (cErr || !conv) throw new Error("Conversa não encontrada");

    const to = normalizePhone(conv.contact_phone);
    if (!to) throw new Error("Telefone do contato inválido");

    let payload: MetaPayload;
    if (data.type === "text") {
      payload = { to, type: "text", text: { body: data.content ?? "" } };
    } else if (data.type === "image") {
      if (!data.mediaUrl) throw new Error("mediaUrl obrigatório para imagem");
      payload = {
        to,
        type: "image",
        image: { link: data.mediaUrl, caption: data.content ?? undefined },
      };
    } else if (data.type === "audio") {
      if (!data.mediaUrl) throw new Error("mediaUrl obrigatório para áudio");
      payload = { to, type: "audio", audio: { link: data.mediaUrl } };
    } else {
      if (!data.mediaUrl) throw new Error("mediaUrl obrigatório para documento");
      payload = {
        to,
        type: "document",
        document: {
          link: data.mediaUrl,
          filename: data.filename ?? data.content ?? "arquivo",
        },
      };
    }

    let wamid: string | null = null;
    let status: "sent" | "failed" = "sent";
    let sendError: string | null = null;
    try {
      wamid = await sendToMeta(payload);
    } catch (e) {
      status = "failed";
      sendError = (e as Error).message ?? String(e);
    }

    const { error: insErr } = await supabaseAdmin.from("messages").insert({
      conversation_id: data.conversationId,
      direction: "outbound",
      type: data.type,
      content: data.content ?? null,
      media_url: data.mediaUrl ?? null,
      sender_id: userId,
      status,
      wamid,
    });
    if (insErr) throw new Error(insErr.message);
    if (sendError) throw new Error(sendError);
    return { ok: true, wamid };
  });
