import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";

async function ensureGestor(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "gestor")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas gestores podem acessar essas configurações.");
}

export const getWhatsappSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("whatsapp_settings")
      .select("access_token, phone_number_id, verify_token, app_secret, business_account_id, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const mask = (v: string | null) =>
      v ? `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} chars)` : null;
    return {
      hasAccessToken: !!data?.access_token,
      hasAppSecret: !!data?.app_secret,
      accessTokenPreview: mask(data?.access_token ?? null),
      appSecretPreview: mask(data?.app_secret ?? null),
      phone_number_id: data?.phone_number_id ?? "",
      verify_token: data?.verify_token ?? "",
      business_account_id: data?.business_account_id ?? "",
      updated_at: data?.updated_at ?? null,
    };
  });

const SaveInput = z.object({
  access_token: z.string().trim().min(20).max(800).optional().nullable(),
  phone_number_id: z.string().trim().regex(/^\d{6,25}$/, "Apenas dígitos"),
  verify_token: z.string().trim().min(8).max(120),
  app_secret: z.string().trim().min(20).max(200).optional().nullable(),
  business_account_id: z.string().trim().regex(/^\d{0,25}$/).optional().nullable(),
});

export const saveWhatsappSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);

    const patch: {
      phone_number_id: string;
      verify_token: string;
      business_account_id: string | null;
      updated_by: string;
      access_token?: string;
      app_secret?: string;
    } = {
      phone_number_id: data.phone_number_id,
      verify_token: data.verify_token,
      business_account_id: data.business_account_id || null,
      updated_by: userId,
    };
    if (data.access_token && data.access_token.length > 0) {
      patch.access_token = data.access_token;
    }
    if (data.app_secret && data.app_secret.length > 0) {
      patch.app_secret = data.app_secret;
    }

    const { error } = await supabaseAdmin
      .from("whatsapp_settings")
      .update(patch)
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);

    const { data: cfg } = await supabaseAdmin
      .from("whatsapp_settings")
      .select("access_token, phone_number_id")
      .eq("id", true)
      .maybeSingle();
    const token = cfg?.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = cfg?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return { ok: false, message: "Token ou Phone Number ID ausentes." };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as any;
      if (!res.ok) {
        return { ok: false, message: json?.error?.message ?? `Meta API ${res.status}` };
      }
      return {
        ok: true,
        message: "Conexão estabelecida.",
        phone: json?.display_phone_number ?? null,
        verifiedName: json?.verified_name ?? null,
        qualityRating: json?.quality_rating ?? null,
      };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
