import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logEvent } from "@/lib/app-logger.server";

const GRAPH_VERSION = "v21.0";
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

function backoffSeconds(attempt: number): number {
  const ladder = [5, 30, 120, 600, 3600];
  return ladder[Math.min(attempt, ladder.length - 1)];
}

async function getAccessToken(accountId: string | null): Promise<string | null> {
  if (accountId) {
    const { data } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("access_token")
      .eq("id", accountId)
      .maybeSingle();
    if (data?.access_token) return data.access_token;
  }
  const { data } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("access_token")
    .eq("id", true)
    .maybeSingle();
  return data?.access_token ?? process.env.WHATSAPP_ACCESS_TOKEN ?? null;
}

async function downloadOne(
  mediaId: string,
  accessToken: string,
  conversationId: string,
): Promise<{ url: string | null; mime: string | null }> {
  const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meta.ok) throw new Error(`graph meta ${meta.status}`);
  const metaJson = (await meta.json()) as { url?: string; mime_type?: string };
  if (!metaJson.url) throw new Error("no url in meta response");
  const bin = await fetch(metaJson.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!bin.ok) throw new Error(`download ${bin.status}`);
  const arr = new Uint8Array(await bin.arrayBuffer());
  const mime = metaJson.mime_type ?? "application/octet-stream";
  const ext = mime.split("/")[1]?.split(";")[0] ?? "bin";
  const path = `${conversationId}/inbound-${Date.now()}-${mediaId}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("chat-media")
    .upload(path, arr, { contentType: mime, upsert: false });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const { data: pub } = supabaseAdmin.storage.from("chat-media").getPublicUrl(path);
  return { url: pub.publicUrl, mime };
}

export const Route = createFileRoute("/api/public/hooks/process-media-queue")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        const { data: candidates, error: selErr } = await supabaseAdmin
          .from("media_download_queue")
          .select("id, message_id, account_id, media_id, attempts")
          .in("status", ["queued", "failed"])
          .lte("next_attempt_at", new Date().toISOString())
          .lt("attempts", MAX_ATTEMPTS)
          .order("created_at", { ascending: true })
          .limit(BATCH_SIZE);

        if (selErr) {
          await logEvent("error", "media-queue", "select failed", { error: selErr.message });
          return new Response(JSON.stringify({ ok: false, error: selErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const items = candidates ?? [];
        let downloaded = 0;
        let failed = 0;

        for (const it of items) {
          // optimistic lock
          const { data: locked } = await supabaseAdmin
            .from("media_download_queue")
            .update({ status: "downloading", attempts: it.attempts + 1 })
            .eq("id", it.id)
            .in("status", ["queued", "failed"])
            .select("id")
            .maybeSingle();
          if (!locked) continue;

          try {
            // discover conversation_id from message
            const { data: msg } = await supabaseAdmin
              .from("messages")
              .select("conversation_id")
              .eq("id", it.message_id)
              .maybeSingle();
            if (!msg) throw new Error("message not found");

            const token = await getAccessToken(it.account_id);
            if (!token) throw new Error("no access token");

            const r = await downloadOne(it.media_id, token, msg.conversation_id);
            if (!r.url) throw new Error("no url after download");

            await supabaseAdmin
              .from("messages")
              .update({ media_url: r.url, media_status: "ready" })
              .eq("id", it.message_id);

            await supabaseAdmin
              .from("media_download_queue")
              .update({
                status: "done",
                downloaded_at: new Date().toISOString(),
                last_error: null,
              })
              .eq("id", it.id);
            downloaded++;
          } catch (e) {
            const errMsg = (e as Error).message.slice(0, 1000);
            const nextAttempts = it.attempts + 1;
            const isFinal = nextAttempts >= MAX_ATTEMPTS;
            if (isFinal) {
              await supabaseAdmin
                .from("media_download_queue")
                .update({ status: "failed", last_error: errMsg })
                .eq("id", it.id);
              await supabaseAdmin
                .from("messages")
                .update({ media_status: "failed" })
                .eq("id", it.message_id);
              failed++;
              await logEvent("error", "media-queue", "download failed (final)", {
                message_id: it.message_id,
                media_id: it.media_id,
                error: errMsg,
              });
            } else {
              await supabaseAdmin
                .from("media_download_queue")
                .update({
                  status: "queued",
                  last_error: errMsg,
                  next_attempt_at: new Date(
                    Date.now() + backoffSeconds(nextAttempts) * 1000,
                  ).toISOString(),
                })
                .eq("id", it.id);
            }
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            downloaded,
            failed,
            took_ms: Date.now() - startedAt,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
