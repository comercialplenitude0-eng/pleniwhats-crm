import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Server-only structured logger. Writes to public.app_logs.
 * Never throws — logging failures are swallowed (also mirrored to console).
 */
export async function logEvent(
  level: LogLevel,
  source: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabaseAdmin.from("app_logs").insert({
      level,
      source,
      message,
      meta: meta as never,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[app-logger] failed:", (e as Error).message);
  }
}
