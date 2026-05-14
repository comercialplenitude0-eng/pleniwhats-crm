import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALLOWED_TYPES = ["audio", "video", "image", "document"] as const;

export const getMediaRetentionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("media_retention_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

const UpdateSchema = z.object({
  enabled: z.boolean(),
  retention_months: z.number().int().min(1).max(60),
  media_types: z.array(z.enum(ALLOWED_TYPES)).min(1).max(10),
});

export const updateMediaRetentionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Check manager role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isManager = (roles ?? []).some((r) => r.role === "admin" || r.role === "gestor");
    if (!isManager) throw new Error("Apenas gestores podem alterar a retenção de mídia");

    const { error } = await supabaseAdmin
      .from("media_retention_settings")
      .update({
        enabled: data.enabled,
        retention_months: data.retention_months,
        media_types: data.media_types,
        updated_by: userId,
      })
      .eq("singleton", true);
    if (error) throw error;
    return { ok: true };
  });

export const runMediaCleanupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isManager = (roles ?? []).some((r) => r.role === "admin" || r.role === "gestor");
    if (!isManager) throw new Error("Apenas gestores podem executar a limpeza");

    const baseUrl =
      process.env.PUBLIC_APP_URL ||
      "https://pleni-connect-chat.lovable.app";
    const res = await fetch(`${baseUrl}/api/public/hooks/cleanup-media`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    return body;
  });
