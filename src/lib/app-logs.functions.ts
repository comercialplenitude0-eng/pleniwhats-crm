import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FilterSchema = z.object({
  level: z.enum(["all", "debug", "info", "warn", "error"]).default("all"),
  source: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

export const listAppLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FilterSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Acesso negado");

    let q = supabaseAdmin
      .from("app_logs")
      .select("id, level, source, message, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.level !== "all") q = q.eq("level", data.level);
    if (data.source) q = q.eq("source", data.source);
    if (data.search) q = q.ilike("message", `%${data.search}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const getSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [pendingWh, pendingOut, pendingMedia, errors1h, lastWh] = await Promise.all([
      supabaseAdmin.from("webhook_events").select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin.from("outbound_queue").select("id", { count: "exact", head: true })
        .eq("status", "queued"),
      supabaseAdmin.from("media_download_queue").select("id", { count: "exact", head: true })
        .in("status", ["queued", "failed"]),
      supabaseAdmin.from("app_logs").select("id", { count: "exact", head: true })
        .eq("level", "error").gte("created_at", since),
      supabaseAdmin.from("webhook_events").select("received_at")
        .order("received_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return {
      webhook_pending: pendingWh.count ?? 0,
      outbound_pending: pendingOut.count ?? 0,
      media_pending: pendingMedia.count ?? 0,
      errors_last_hour: errors1h.count ?? 0,
      last_webhook_at: lastWh.data?.received_at ?? null,
    };
  });
