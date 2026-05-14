import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "chat-media";

function extractStoragePath(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function runCleanup() {
  const { data: settings, error: sErr } = await supabaseAdmin
    .from("media_retention_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!settings) return { ok: true, skipped: "no-settings" };
  if (!settings.enabled) return { ok: true, skipped: "disabled" };

  const months = Number(settings.retention_months ?? 12);
  const types: string[] = Array.isArray(settings.media_types)
    ? settings.media_types
    : ["audio", "video"];

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  // Find old messages with media (paginate to avoid 1000-row limit)
  let totalDeleted = 0;
  let totalScanned = 0;
  const PAGE = 500;
  // loop until no more rows
  // safety cap to avoid runaway invocations
  for (let i = 0; i < 100; i++) {
    const { data: rows, error } = await supabaseAdmin
      .from("messages")
      .select("id, media_url, type, created_at")
      .in("type", types as Array<"audio" | "video" | "image" | "document" | "template" | "text">)
      .not("media_url", "is", null)
      .lt("created_at", cutoff.toISOString())
      .order("created_at", { ascending: true })
      .limit(PAGE);

    if (error) throw error;
    if (!rows || rows.length === 0) break;

    totalScanned += rows.length;

    const paths: string[] = [];
    const ids: string[] = [];
    for (const r of rows) {
      const p = extractStoragePath(r.media_url as string);
      if (p) paths.push(p);
      ids.push(r.id as string);
    }

    if (paths.length > 0) {
      // remove() accepts up to ~1000 paths per call
      const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
      if (rmErr) console.error("storage remove error", rmErr);
      else totalDeleted += paths.length;
    }

    // Null out media_url so UI shows "[mídia expirada]"
    const { error: upErr } = await supabaseAdmin
      .from("messages")
      .update({ media_url: null, content: "[mídia expirada]" })
      .in("id", ids);
    if (upErr) console.error("messages update error", upErr);

    if (rows.length < PAGE) break;
  }

  await supabaseAdmin
    .from("media_retention_settings")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_deleted_count: totalDeleted,
    })
    .eq("singleton", true);

  return { ok: true, scanned: totalScanned, deleted: totalDeleted, cutoff: cutoff.toISOString() };
}

export const Route = createFileRoute("/api/public/hooks/cleanup-media")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await runCleanup();
          return Response.json(result);
        } catch (e) {
          console.error("cleanup-media failed", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
      GET: async () => {
        // Allow manual trigger via browser/curl for testing
        try {
          const result = await runCleanup();
          return Response.json(result);
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
