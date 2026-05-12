import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RD_BASE = "https://api.rd.services";

type RDContact = {
  uuid?: string;
  name?: string | null;
  email?: string | null;
  mobile_phone?: string | null;
  personal_phone?: string | null;
  [k: string]: unknown;
};

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^\d+]/g, "");
  return digits.length >= 8 ? digits : null;
}

async function rdFetch(path: string, token: string) {
  const res = await fetch(`${RD_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`RD Station ${res.status}: ${txt.slice(0, 200) || res.statusText}`);
  }
  return res.json();
}

/** List all segmentations available in the RD Station account. */
export const listRdSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = process.env.RD_STATION_API_TOKEN;
    if (!token) throw new Error("RD_STATION_API_TOKEN não configurado");
    const data = await rdFetch("/platform/segmentations", token);
    const items = (data?.segmentations ?? data?.items ?? data ?? []) as Array<{
      id: string | number; name: string; standard?: boolean; created_at?: string;
    }>;
    return {
      segments: items.map((s) => ({
        id: String(s.id),
        name: s.name,
        standard: !!s.standard,
        created_at: s.created_at ?? null,
      })),
    };
  });

/** Fetch all contacts of a segmentation (paginated). */
export const fetchRdSegmentContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    segmentId: z.string().min(1),
    maxPages: z.number().int().min(1).max(50).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const token = process.env.RD_STATION_API_TOKEN;
    if (!token) throw new Error("RD_STATION_API_TOKEN não configurado");

    const out: Array<{ phone: string; name?: string; vars?: Record<string, string> }> = [];
    const seen = new Set<string>();
    const limit = data.maxPages ?? 20;
    let page = 1;
    let totalRaw = 0;

    while (page <= limit) {
      const json = await rdFetch(
        `/platform/segmentations/${encodeURIComponent(data.segmentId)}/contacts?page=${page}&page_size=125`,
        token,
      );
      const list = (json?.contacts ?? json?.items ?? []) as RDContact[];
      if (list.length === 0) break;
      totalRaw += list.length;
      for (const c of list) {
        const phone = normalizePhone(c.mobile_phone) ?? normalizePhone(c.personal_phone);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        out.push({
          phone,
          name: c.name ?? undefined,
          vars: c.email ? { email: String(c.email) } : undefined,
        });
      }
      if (list.length < 125) break;
      page += 1;
    }

    return { recipients: out, totalRaw, pagesFetched: page };
  });
