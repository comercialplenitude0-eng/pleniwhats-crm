import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";

export type MetaPayload = Record<string, unknown> & { to: string; type: string };

export function normalizePhone(p: string) {
  return (p ?? "").replace(/\D/g, "");
}

export async function getCredsForAccount(accountId: string | null): Promise<{
  token: string;
  phoneId: string;
}> {
  if (accountId) {
    const { data: acc } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("access_token, phone_number_id, enabled")
      .eq("id", accountId)
      .maybeSingle();
    if (acc?.enabled === false) {
      throw new Error("Esta conta WhatsApp está desativada.");
    }
    if (acc?.access_token && acc?.phone_number_id) {
      return { token: acc.access_token, phoneId: acc.phone_number_id };
    }
  }
  const { data: any1 } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("access_token, phone_number_id")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (any1?.access_token && any1?.phone_number_id) {
    return { token: any1.access_token, phoneId: any1.phone_number_id };
  }
  const { data: cfg } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("access_token, phone_number_id")
    .eq("id", true)
    .maybeSingle();
  const token = cfg?.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = cfg?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error(
      "Nenhuma conta WhatsApp configurada. Cadastre uma em Configurações → Contas WhatsApp.",
    );
  }
  return { token, phoneId };
}

/**
 * Envia para a Graph API. Distingue erros transitórios (429/5xx) de
 * permanentes (4xx) para a fila decidir reagendar ou marcar 'failed'.
 */
export async function sendToMeta(
  payload: MetaPayload,
  accountId: string | null,
): Promise<{ wamid: string | null; transientError?: string; permanentError?: string }> {
  let creds: { token: string; phoneId: string };
  try {
    creds = await getCredsForAccount(accountId);
  } catch (e) {
    return { wamid: null, permanentError: (e as Error).message };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${creds.phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      },
    );
  } catch (e) {
    return { wamid: null, transientError: (e as Error).message };
  }

  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };

  if (res.ok) {
    return { wamid: json?.messages?.[0]?.id ?? null };
  }
  const msg = json?.error?.message ?? `Meta API ${res.status}`;
  if (res.status === 429 || res.status >= 500) {
    return { wamid: null, transientError: msg };
  }
  return { wamid: null, permanentError: msg };
}

export function buildMetaPayload(
  to: string,
  type: "text" | "image" | "document" | "audio",
  content: string | null | undefined,
  mediaUrl: string | null | undefined,
  filename: string | null | undefined,
): MetaPayload {
  if (type === "text") {
    return { to, type: "text", text: { body: content ?? "" } };
  }
  if (type === "image") {
    if (!mediaUrl) throw new Error("mediaUrl obrigatório para imagem");
    return {
      to,
      type: "image",
      image: { link: mediaUrl, caption: content ?? undefined },
    };
  }
  if (type === "audio") {
    if (!mediaUrl) throw new Error("mediaUrl obrigatório para áudio");
    return { to, type: "audio", audio: { link: mediaUrl } };
  }
  if (!mediaUrl) throw new Error("mediaUrl obrigatório para documento");
  return {
    to,
    type: "document",
    document: {
      link: mediaUrl,
      filename: filename ?? content ?? "arquivo",
    },
  };
}
