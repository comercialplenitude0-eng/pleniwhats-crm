import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * RD Station CRM API
 * Base: https://crm.rdstation.com/api/v1
 * Auth: ?token=<INSTANCE_TOKEN>  (token de instância do CRM, NÃO é o do RD Marketing)
 */
const RD_CRM_BASE = "https://crm.rdstation.com/api/v1";

function getToken(): string {
  // Aceita o nome novo (preferido) ou cai no antigo para retrocompatibilidade.
  const token = process.env.RD_CRM_TOKEN || process.env.RD_STATION_API_TOKEN;
  if (!token) throw new Error("RD_CRM_TOKEN não configurado");
  return token;
}

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^\d+]/g, "");
  return digits.length >= 8 ? digits : null;
}

async function rdCrm(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
) {
  const token = getToken();
  const url = new URL(`${RD_CRM_BASE}${path}`);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const { query: _q, ...rest } = init;
  const res = await fetch(url.toString(), {
    ...rest,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(rest.headers ?? {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`RD CRM ${res.status}: ${txt.slice(0, 250) || res.statusText}`);
  }
  return res.json();
}

type RdStage = { _id: string; name: string; deal_pipeline_id?: string; nickname?: string };
type RdPipeline = { _id: string; name: string; deal_stages?: RdStage[] };

/** Lista funis (pipelines) e suas etapas. */
export const listRdPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // /deal_pipelines retorna pipelines; pedimos as stages embutidas quando suportado
    const data = await rdCrm("/deal_pipelines");
    const pipelines = (data?.deal_pipelines ?? data ?? []) as RdPipeline[];

    // Para cada pipeline, garante que temos as stages — busca se não vieram embutidas.
    const enriched = await Promise.all(
      pipelines.map(async (p) => {
        let stages = p.deal_stages ?? [];
        if (stages.length === 0) {
          try {
            const sd = await rdCrm("/deal_stages", { query: { deal_pipeline_id: p._id } });
            stages = (sd?.deal_stages ?? sd ?? []) as RdStage[];
          } catch {
            stages = [];
          }
        }
        return {
          id: String(p._id),
          name: p.name,
          stages: stages.map((s) => ({ id: String(s._id), name: s.name })),
        };
      }),
    );
    return { pipelines: enriched };
  });

type RdContact = { _id?: string; name?: string; phones?: Array<{ phone?: string; type?: string }>; emails?: Array<{ email?: string }> };
type RdDeal = {
  _id: string;
  name?: string;
  contacts?: RdContact[];
  deal_stage?: { _id?: string; name?: string };
};

/** Busca todos os deals de uma etapa (paginado) e devolve como recipients. */
export const fetchRdStageDeals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      stageId: z.string().min(1),
      maxPages: z.number().int().min(1).max(50).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const out: Array<{ phone: string; name?: string; vars?: Record<string, string> }> = [];
    const seen = new Set<string>();
    const limit = data.maxPages ?? 25;
    let page = 1;
    let totalRaw = 0;

    while (page <= limit) {
      const json = await rdCrm("/deals", {
        query: { deal_stage_id: data.stageId, page, limit: 200 },
      });
      const list = (json?.deals ?? json?.items ?? []) as RdDeal[];
      if (list.length === 0) break;
      totalRaw += list.length;

      for (const deal of list) {
        const c = deal.contacts?.[0];
        const phoneRaw =
          c?.phones?.find((p) => p.phone)?.phone ?? c?.phones?.[0]?.phone ?? null;
        const phone = normalizePhone(phoneRaw);
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        const email = c?.emails?.find((e) => e.email)?.email;
        out.push({
          phone,
          name: c?.name ?? deal.name,
          vars: {
            deal_id: deal._id,
            ...(email ? { email } : {}),
            ...(deal.name ? { negocio: deal.name } : {}),
          },
        });
      }

      if (list.length < 200) break;
      page += 1;
    }

    return { recipients: out, totalRaw, pagesFetched: page };
  });

/** Move um deal para outra etapa (chamada após o disparo). */
export const moveRdDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dealId: z.string().min(1), stageId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    await rdCrm(`/deals/${encodeURIComponent(data.dealId)}`, {
      method: "PUT",
      body: JSON.stringify({ deal: { deal_stage_id: data.stageId } }),
    });
    return { ok: true };
  });
