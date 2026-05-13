import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";

type AnyObj = Record<string, any>;

function normalizeDigits(p?: string | null): string {
  return (p ?? "").replace(/\D/g, "");
}

async function getCredsByPhoneId(phoneNumberId: string | null) {
  // Tenta primeiro nas contas (multi-conta)
  if (phoneNumberId) {
    const { data: acc } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("id, access_token, app_secret, verify_token")
      .eq("phone_number_id", phoneNumberId)
      .maybeSingle();
    if (acc) {
      return {
        accountId: acc.id as string,
        accessToken: acc.access_token,
        appSecret: acc.app_secret,
        verifyToken: acc.verify_token,
      };
    }
  }
  // Fallback: legado
  const { data } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("access_token, verify_token, app_secret")
    .eq("id", true)
    .maybeSingle();
  return {
    accountId: null as string | null,
    accessToken: data?.access_token || process.env.WHATSAPP_ACCESS_TOKEN || null,
    verifyToken: data?.verify_token || process.env.WHATSAPP_VERIFY_TOKEN || null,
    appSecret: data?.app_secret || process.env.WHATSAPP_APP_SECRET || null,
  };
}

// Para verificação inicial (sem payload), aceitar verify_token de QUALQUER conta
async function findVerifyToken(token: string): Promise<boolean> {
  const { data: accs } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("verify_token")
    .eq("verify_token", token)
    .limit(1);
  if (accs && accs.length > 0) return true;
  const { data: legacy } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("verify_token")
    .eq("id", true)
    .maybeSingle();
  return !!legacy?.verify_token && legacy.verify_token === token;
}

async function downloadMediaToBucket(
  mediaId: string,
  conversationId: string,
  accessToken: string | null,
): Promise<{ url: string | null; mime: string | null; filename: string | null }> {
  const token = accessToken;
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
  accountId: string | null,
): Promise<string | null> {
  const tail = waPhone.slice(-8);
  const phonePlus = `+${waPhone}`;

  // Procura por conversa do mesmo telefone NA MESMA CONTA (multi-conta: mesmo
  // contato pode ter conversa em contas diferentes)
  const baseQuery = supabaseAdmin
    .from("conversations")
    .select("id, contact_phone, account_id")
    .or(`contact_phone.eq.${waPhone},contact_phone.eq.${phonePlus},contact_phone.ilike.%${tail}`)
    .limit(10);
  const { data: existing } = await baseQuery;
  const match = (existing ?? []).find((c) => {
    const np = normalizeDigits(c.contact_phone);
    const phoneMatch = np === waPhone || np.endsWith(tail);
    if (!phoneMatch) return false;
    // Mesma conta OU conversa legacy sem account_id
    return !accountId || !c.account_id || c.account_id === accountId;
  });
  if (match) {
    // Se conversa legacy sem account_id, atualiza com a conta atual
    if (accountId && !match.account_id) {
      await supabaseAdmin
        .from("conversations")
        .update({ account_id: accountId })
        .eq("id", match.id);
    }
    return match.id;
  }

  const { data: created, error } = await supabaseAdmin
    .from("conversations")
    .insert({
      contact_name: contactName ?? phonePlus,
      contact_phone: phonePlus,
      wa_contact_id: waId ?? waPhone,
      account_id: accountId,
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
        if (mode === "subscribe" && token && (await findVerifyToken(token))) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: AnyObj = {};
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }

        // Descobre o phone_number_id do payload para resolver a conta correta
        const firstChange = (payload?.entry ?? [])[0]?.changes?.[0]?.value as AnyObj | undefined;
        const incomingPhoneId: string | null =
          firstChange?.metadata?.phone_number_id ?? null;
        const { accountId, accessToken, appSecret } = await getCredsByPhoneId(incomingPhoneId);

        // Verificação de assinatura (X-Hub-Signature-256) com o app_secret da conta
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
              const convoId = await findOrCreateConversation(
                waPhone,
                contactName,
                waIdTop,
                accountId,
              );
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
                const r = await downloadMediaToBucket(msg.image.id, convoId, accessToken);
                mediaUrl = r.url;
              } else if (mtype === "audio" && msg.audio?.id) {
                type = "audio";
                const r = await downloadMediaToBucket(msg.audio.id, convoId, accessToken);
                mediaUrl = r.url;
              } else if (mtype === "voice" && msg.voice?.id) {
                type = "audio";
                const r = await downloadMediaToBucket(msg.voice.id, convoId, accessToken);
                mediaUrl = r.url;
              } else if (mtype === "document" && msg.document?.id) {
                type = "document";
                content = msg.document?.filename ?? null;
                const r = await downloadMediaToBucket(msg.document.id, convoId, accessToken);
                mediaUrl = r.url;
              } else if (mtype === "video" && msg.video?.id) {
                type = "document";
                content = "vídeo recebido";
                const r = await downloadMediaToBucket(msg.video.id, convoId, accessToken);
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
                account_id: accountId,
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
