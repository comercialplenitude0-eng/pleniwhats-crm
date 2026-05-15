import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";

type AnyObj = Record<string, any>;

function normalizeDigits(p?: string | null): string {
  return (p ?? "").replace(/\D/g, "");
}

async function getCredsByPhoneId(phoneNumberId: string | null) {
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

async function downloadMediaToBucket(
  mediaId: string,
  conversationId: string,
  accessToken: string | null,
): Promise<{ url: string | null; mime: string | null; filename: string | null }> {
  const token = accessToken;
  if (!token) return { url: null, mime: null, filename: null };
  try {
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meta.ok) return { url: null, mime: null, filename: null };
    const metaJson = (await meta.json()) as AnyObj;
    const mediaUrl: string | undefined = metaJson?.url;
    const mime: string | undefined = metaJson?.mime_type;
    if (!mediaUrl) return { url: null, mime: mime ?? null, filename: null };

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
  const phonePlus = `+${waPhone}`;

  // Hot path: índice (account_id, contact_phone)
  if (accountId) {
    const { data: hot } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("account_id", accountId)
      .in("contact_phone", [waPhone, phonePlus])
      .limit(1)
      .maybeSingle();
    if (hot) return hot.id;
  }

  // Fallback (legacy / cross-account migration)
  const tail = waPhone.slice(-8);
  const { data: existing } = await supabaseAdmin
    .from("conversations")
    .select("id, contact_phone, account_id")
    .or(`contact_phone.eq.${waPhone},contact_phone.eq.${phonePlus},contact_phone.ilike.%${tail}`)
    .limit(10);
  const match = (existing ?? []).find((c) => {
    const np = normalizeDigits(c.contact_phone);
    const phoneMatch = np === waPhone || np.endsWith(tail);
    if (!phoneMatch) return false;
    return !accountId || !c.account_id || c.account_id === accountId;
  });
  if (match) {
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
    console.error("[whatsapp processor] criar conversa:", error.message);
    return null;
  }
  return created.id;
}

export async function processWhatsappPayload(payload: AnyObj): Promise<void> {
  const firstChange = (payload?.entry ?? [])[0]?.changes?.[0]?.value as AnyObj | undefined;
  const incomingPhoneId: string | null = firstChange?.metadata?.phone_number_id ?? null;
  const { accountId, accessToken } = await getCredsByPhoneId(incomingPhoneId);

  const entries = (payload?.entry ?? []) as AnyObj[];
  for (const entry of entries) {
    for (const change of (entry?.changes ?? []) as AnyObj[]) {
      const value = (change?.value ?? {}) as AnyObj;
      const contacts = (value?.contacts ?? []) as AnyObj[];
      const contactName: string | null = contacts[0]?.profile?.name ?? null;
      const waIdTop: string | null = contacts[0]?.wa_id ?? null;

      for (const msg of (value?.messages ?? []) as AnyObj[]) {
        const waPhone = normalizeDigits(msg.from ?? waIdTop ?? "");
        if (!waPhone) continue;

        // Idempotência via wamid (índice único impede duplicatas)
        if (msg.id) {
          const { data: existing } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("wamid", msg.id)
            .maybeSingle();
          if (existing) continue;
        }

        const convoId = await findOrCreateConversation(waPhone, contactName, waIdTop, accountId);
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
        if (insErr && !/duplicate key/i.test(insErr.message)) {
          console.error("[whatsapp processor] insert msg:", insErr.message);
        }
      }

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
}

export async function verifyMetaSignature(
  raw: string,
  signature: string | null,
  phoneNumberId: string | null,
): Promise<boolean> {
  const { appSecret } = await getCredsByPhoneId(phoneNumberId);
  if (!appSecret) return true; // sem secret configurado, não bloqueia (compat)
  if (!signature) return false;
  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function findVerifyTokenMatch(token: string): Promise<boolean> {
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
