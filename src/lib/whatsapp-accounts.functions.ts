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
  if (!data) throw new Error("Apenas gestores podem gerenciar contas WhatsApp.");
}

const mask = (v: string | null | undefined) =>
  v ? `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} chars)` : null;

export const listWhatsappAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select(
        "id, display_name, phone_number, phone_number_id, business_account_id, access_token, app_secret, verify_token, enabled, created_at, updated_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((a) => ({
      id: a.id,
      display_name: a.display_name,
      phone_number: a.phone_number,
      phone_number_id: a.phone_number_id,
      business_account_id: a.business_account_id,
      verify_token: a.verify_token,
      enabled: a.enabled,
      created_at: a.created_at,
      updated_at: a.updated_at,
      hasAccessToken: !!a.access_token,
      hasAppSecret: !!a.app_secret,
      accessTokenPreview: mask(a.access_token),
      appSecretPreview: mask(a.app_secret),
    }));
  });

const SaveAccountInput = z.object({
  id: z.string().uuid().nullable().optional(),
  display_name: z.string().trim().min(1).max(80),
  phone_number: z.string().trim().max(40).optional().nullable(),
  phone_number_id: z.string().trim().regex(/^\d{6,25}$/, "Apenas dígitos"),
  business_account_id: z
    .string()
    .trim()
    .regex(/^\d{0,25}$/)
    .optional()
    .nullable(),
  verify_token: z.string().trim().min(8).max(120),
  access_token: z.string().trim().min(20).max(800).optional().nullable(),
  app_secret: z.string().trim().min(20).max(200).optional().nullable(),
  enabled: z.boolean().optional(),
});

export const saveWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SaveAccountInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);

    const base: Record<string, unknown> = {
      display_name: data.display_name,
      phone_number: data.phone_number || null,
      phone_number_id: data.phone_number_id,
      business_account_id: data.business_account_id || null,
      verify_token: data.verify_token,
      enabled: data.enabled ?? true,
    };
    if (data.access_token && data.access_token.length > 0) {
      base.access_token = data.access_token;
    }
    if (data.app_secret && data.app_secret.length > 0) {
      base.app_secret = data.app_secret;
    }

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("whatsapp_accounts")
        .update(base)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    } else {
      base.created_by = userId;
      const { data: ins, error } = await supabaseAdmin
        .from("whatsapp_accounts")
        .insert(base as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: ins.id as string };
    }
  });

const DeleteAccountInput = z.object({ id: z.string().uuid() });

export const deleteWhatsappAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteAccountInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);
    const { error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const TestConnInput = z.object({ id: z.string().uuid() });

export const testAccountConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TestConnInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);
    const { data: acc } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("access_token, phone_number_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!acc?.access_token || !acc?.phone_number_id) {
      return { ok: false, message: "Token ou Phone Number ID ausentes." };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${acc.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${acc.access_token}` } },
      );
      const json = (await res.json()) as any;
      if (!res.ok) {
        return {
          ok: false,
          message: json?.error?.message ?? `Meta API ${res.status}`,
        };
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

// ===== User ↔ Account access =====

const SetAccessInput = z.object({
  user_id: z.string().uuid(),
  account_ids: z.array(z.string().uuid()),
});

export const setUserAccountAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetAccessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);

    // Replace strategy: delete then insert
    const { error: dErr } = await supabaseAdmin
      .from("user_whatsapp_access")
      .delete()
      .eq("user_id", data.user_id);
    if (dErr) throw new Error(dErr.message);

    if (data.account_ids.length > 0) {
      const rows = data.account_ids.map((account_id) => ({
        user_id: data.user_id,
        account_id,
      }));
      const { error: iErr } = await supabaseAdmin
        .from("user_whatsapp_access")
        .insert(rows);
      if (iErr) throw new Error(iErr.message);
    }
    return { ok: true, count: data.account_ids.length };
  });

export const getAllUserAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureGestor(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("user_whatsapp_access")
      .select("user_id, account_id");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
