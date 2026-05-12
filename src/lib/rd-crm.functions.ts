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
    console.error(`[RD CRM] ${init.method ?? "GET"} ${path} -> ${res.status}: ${txt.slice(0, 400)}`);
    throw new Error(`RD CRM ${res.status}: ${txt.slice(0, 250) || res.statusText}`);
  }
  return res.json();
}

type RdStage = {
  _id?: string;
  id?: string;
  name: string;
  order?: number;
  deal_pipeline_id?: string;
  nickname?: string;
  deal_pipeline?: { _id?: string; id?: string; name?: string; order?: number };
};
type RdPipeline = { _id?: string; id?: string; name: string; order?: number; deal_stages?: RdStage[] };

const rdId = (item?: { _id?: string; id?: string } | null) => String(item?._id ?? item?.id ?? "");
const normalizeStages = (stages: RdStage[]) =>
  stages
    .map((s) => ({ id: rdId(s), name: s.name, order: s.order ?? 0 }))
    .filter((s) => s.id && s.name)
    .sort((a, b) => a.order - b.order)
    .map(({ id, name }) => ({ id, name }));

/** Lista funis (pipelines) e suas etapas. */
export const listRdPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await rdCrm("/deal_pipelines");
    const pipelines = (Array.isArray(data) ? data : data?.deal_pipelines ?? data?.items ?? []) as RdPipeline[];

    const enriched = await Promise.all(
      pipelines.map(async (p) => {
        const pid = rdId(p);
        let stages = p.deal_stages ?? [];
        if (stages.length === 0 && pid) {
          try {
            const sd = await rdCrm("/deal_stages", { query: { deal_pipeline_id: pid } });
            stages = (Array.isArray(sd) ? sd : sd?.deal_stages ?? []) as RdStage[];
          } catch {
            stages = [];
          }
        }
        return {
          id: pid,
          name: p.name,
          order: p.order ?? 0,
          stages: normalizeStages(stages),
        };
      }),
    );

    if (enriched.length > 0) {
      return { pipelines: enriched.sort((a, b) => a.order - b.order).map(({ id, name, stages }) => ({ id, name, stages })) };
    }

    const stageData = await rdCrm("/deal_stages");
    const stages = (Array.isArray(stageData) ? stageData : stageData?.deal_stages ?? []) as RdStage[];
    const grouped = new Map<string, { id: string; name: string; order: number; stages: RdStage[] }>();
    for (const stage of stages) {
      const pipeline = stage.deal_pipeline;
      const pid = rdId(pipeline) || stage.deal_pipeline_id || "default";
      if (!grouped.has(pid)) grouped.set(pid, { id: pid, name: pipeline?.name ?? "Funil padrão", order: pipeline?.order ?? 0, stages: [] });
      grouped.get(pid)!.stages.push(stage);
    }

    return {
      pipelines: Array.from(grouped.values())
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ id: p.id, name: p.name, stages: normalizeStages(p.stages) })),
    };
  });

type RdContact = { _id?: string; name?: string; phones?: Array<{ phone?: string; type?: string }>; emails?: Array<{ email?: string }> };
type RdDeal = {
  _id?: string;
  id?: string;
  name?: string;
  contacts?: RdContact[];
  deal_stage?: { _id?: string; id?: string; name?: string };
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
      const list = (Array.isArray(json) ? json : json?.deals ?? json?.items ?? []) as RdDeal[];
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
        const dealId = String(deal._id ?? deal.id ?? "");
        out.push({
          phone,
          name: c?.name ?? deal.name,
          vars: {
            ...(dealId ? { deal_id: dealId } : {}),
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
