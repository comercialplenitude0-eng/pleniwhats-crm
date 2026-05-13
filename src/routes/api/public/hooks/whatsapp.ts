import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";

type AnyObj = Record<string, any>;

function normalizeDigits(p?: string | null): string {
  return (p ?? "").replace(/\D/g, "");
}

async function downloadMediaToBucket(
  mediaId: string,
  conversationId: string,
): Promise<{ url: string | null; mime: string | null; filename: string | null }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { url: null, mime: null, filename: null };
  try {
    // 1) get media URL
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meta.ok) return { url: null, mime: null, filename: null };
    const metaJson = (await meta.json()) as AnyObj;
    const mediaUrl: string | undefined = metaJson?.url;
    const mime: string | undefined = metaJson?.mime_type;
    if (!mediaUrl) return { url: null, mime: mime ?? null, filename: null };

    // 2) fetch binary
    const bin = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok) return { url: null, mime: mime ?? null, filename: null };
    const arr = new Uint8Array(await bin.arrayBuffer());
    const ext = (mime ?? "application/octet-stream").split("/")[1]?.split(";")[0] ?? "bin";
    const filename = `${mediaId}.${ext}`;
    const path = `${conversationId}/inbound-${Date.now()}-${filename}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("chat-media")
      .upload(path, arr, { contentType: mime ?? undefined, upsert: false });
    if (upErr) return { url: null, mime: mime ?? null, filename };
    const { data: pub } = supabaseAdmin.storage.from("chat-media").getPublicUrl(path);
    return { url: pub.publicUrl, mime: mime ?? null, filename };
  } catch {
    return { url: null, mime: null, filename: null };
  }
}

async function findOrCreateConversation(
  waPhone: string,
  contactName: string | null,
  waId: string | null,
): Promise<string | null> {
  const tail = waPhone.slice(-8);
  const phonePlus = `+${waPhone}`;
  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("id, contact_phone")
    .or(`contact_phone.eq.${waPhone},contact_phone.eq.${phonePlus},contact_phone.ilike.%${tail}`)
    .limit(5);
  const match = (existing ?? []).find((c) => {
    const np = normalizeDigits(c.contact_phone);
    return np === waPhone || np.endsWith(tail);
  });
  if (match) return match.id;

  const { data: created, error } = await supabaseAdmin
    .from("conversations")
    .insert({
      contact_name: contactName ?? phonePlus,
      contact_phone: phonePlus,
      wa_contact_id: waId ?? waPhone,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[whatsapp webhook] criar conversa:", error.message);
    return null;
  }
  return created.id;
}

export const Route = createFileRoute("/api/public/hooks/whatsapp")({
  server: {
    handlers: {
      // Verificação inicial do webhook (Meta envia GET com hub.challenge)
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const verify = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && verify && token === verify) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();

        // Verificação de assinatura (X-Hub-Signature-256) usando WHATSAPP_APP_SECRET
        const appSecret = process.env.WHATSAPP_APP_SECRET;
        if (appSecret) {
          const sig = request.headers.get("x-hub-signature-256") ?? "";
          const expected =
            "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
          try {
            const a = Buffer.from(sig);
            const b = Buffer.from(expected);
            if (a.length !== b.length || !timingSafeEqual(a, b)) {
              return new Response("invalid signature", { status: 401 });
            }
          } catch {
            return new Response("invalid signature", { status: 401 });
          }
        }

        let payload: AnyObj = {};
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        const entries = (payload?.entry ?? []) as AnyObj[];
        for (const entry of entries) {
          for (const change of (entry?.changes ?? []) as AnyObj[]) {
            const value = (change?.value ?? {}) as AnyObj;
            const contacts = (value?.contacts ?? []) as AnyObj[];
            const contactName: string | null = contacts[0]?.profile?.name ?? null;
            const waIdTop: string | null = contacts[0]?.wa_id ?? null;

            // Mensagens recebidas
            for (const msg of (value?.messages ?? []) as AnyObj[]) {
              const waPhone = normalizeDigits(msg.from ?? waIdTop ?? "");
              if (!waPhone) continue;
              const convoId = await findOrCreateConversation(waPhone, contactName, waIdTop);
              if (!convoId) continue;

              let type: "text" | "image" | "audio" | "document" = "text";
              let content: string | null = null;
              let mediaUrl: string | null = null;
              const mtype = msg.type as string;

              if (mtype === "text") {
                content = msg.text?.body ?? null;
              } else if (mtype === "image" && msg.image?.id) {
                type = "image";
                content = msg.image?.caption ?? null;
                const r = await downloadMediaToBucket(msg.image.id, convoId);
                mediaUrl = r.url;
              } else if (mtype === "audio" && msg.audio?.id) {
                type = "audio";
                const r = await downloadMediaToBucket(msg.audio.id, convoId);
                mediaUrl = r.url;
              } else if (mtype === "voice" && msg.voice?.id) {
                type = "audio";
                const r = await downloadMediaToBucket(msg.voice.id, convoId);
                mediaUrl = r.url;
              } else if (mtype === "document" && msg.document?.id) {
                type = "document";
                content = msg.document?.filename ?? null;
                const r = await downloadMediaToBucket(msg.document.id, convoId);
                mediaUrl = r.url;
              } else if (mtype === "video" && msg.video?.id) {
                type = "document";
                content = "vídeo recebido";
                const r = await downloadMediaToBucket(msg.video.id, convoId);
                mediaUrl = r.url;
              } else if (mtype === "button") {
                content = msg.button?.text ?? null;
              } else if (mtype === "interactive") {
                content =
                  msg.interactive?.button_reply?.title ??
                  msg.interactive?.list_reply?.title ??
                  null;
              } else {
                content = `[${mtype}]`;
              }

              const { error: insErr } = await supabaseAdmin.from("messages").insert({
                conversation_id: convoId,
                direction: "inbound",
                type,
                content,
                media_url: mediaUrl,
                wamid: msg.id ?? null,
                status: "delivered",
              });
              if (insErr) console.error("[whatsapp webhook] insert msg:", insErr.message);
            }

            // Status (sent/delivered/read/failed) — atualiza pela wamid
            for (const st of (value?.statuses ?? []) as AnyObj[]) {
              const wamid = st.id as string | undefined;
              const status = st.status as string | undefined;
              if (!wamid || !status) continue;
              const allowed = ["sent", "delivered", "read", "failed"] as const;
              if (!(allowed as readonly string[]).includes(status)) continue;
              await supabaseAdmin
                .from("messages")
                .update({ status: status as (typeof allowed)[number] })
                .eq("wamid", wamid);
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
