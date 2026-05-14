import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * RD Station CRM API
 * Base: https://crm.rdstation.com/api/v1
 * Auth: ?token=<INSTANCE_TOKEN>
 */
const RD_CRM_BASE = "https://crm.rdstation.com/api/v1";

function getToken(): string {
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
  if (res.status === 204) return null;
  const txt = await res.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return txt; }
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
    .map((s) => ({ id: rdId(s), name: s.name, order: s.order ?? 0, pipelineId: rdId(s.deal_pipeline) || s.deal_pipeline_id || "" }))
    .filter((s) => s.id && s.name)
    .sort((a, b) => a.order - b.order);

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
          stages: normalizeStages(stages).map(({ id, name }) => ({ id, name })),
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
        .map((p) => ({ id: p.id, name: p.name, stages: normalizeStages(p.stages).map(({ id, name }) => ({ id, name })) })),
    };
  });

type RdContact = { _id?: string; id?: string; name?: string; phones?: Array<{ phone?: string; type?: string }>; emails?: Array<{ email?: string }> };
type RdDeal = {
  _id?: string;
  id?: string;
  name?: string;
  contacts?: RdContact[];
  deal_stage?: { _id?: string; id?: string; name?: string; deal_pipeline_id?: string; deal_pipeline?: { _id?: string; id?: string; name?: string } };
  deal_custom_fields?: Array<{
    _id?: string;
    custom_field_id?: string;
    value?: unknown;
    custom_field?: { _id?: string; id?: string; label?: string; type?: string };
  }>;
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
        const phoneRaw = c?.phones?.find((p) => p.phone)?.phone ?? c?.phones?.[0]?.phone ?? null;
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

/** Move um deal para outra etapa. */
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

// ----------- Custom fields & deal mirror -----------

export type RdCustomFieldOption = { id: string; label: string };
export type RdCustomFieldDef = {
  id: string;
  label: string;
  type: string; // text, int, decimal, date, datetime, list, multi_select, check_box, phone, ...
  options: RdCustomFieldOption[];
};

function parseCustomFieldDef(raw: any): RdCustomFieldDef | null {
  const id = String(raw?._id ?? raw?.id ?? "");
  if (!id) return null;
  const opts = (raw?.custom_field_options ??
    raw?.selectable_options ??
    raw?.options ??
    raw?.values ??
    []) as Array<any>;
  const rawType = String(
    raw?.type ?? raw?.field_type ?? raw?.presentation_type ?? raw?.kind ?? "text",
  ).toLowerCase();
  // Se vier opções e o tipo não indicar lista, força "list" para virar dropdown
  const type = opts.length > 0 && !rawType.includes("multi") && !rawType.includes("check")
    ? (rawType === "text" || rawType === "string" ? "list" : rawType)
    : rawType;
  return {
    id,
    label: String(raw?.label ?? raw?.name ?? id),
    type,
    options: opts
      .map((o) => ({
        id: String(o?._id ?? o?.id ?? o?.value ?? ""),
        label: String(o?.label ?? o?.name ?? o?.value ?? ""),
      }))
      .filter((o) => o.id || o.label),
  };
}

/** Lista definições de campos personalizados de deals no RD CRM. */
export const listRdDealCustomFields = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Tenta vários endpoints/queries — o RD CRM tem variações por conta
    const tryPaths: Array<{ path: string; query?: Record<string, string> }> = [
      { path: "/custom_fields", query: { for: "deal" } },
      { path: "/custom_fields/deal" },
      { path: "/custom_fields", query: { _for: "deal" } },
      { path: "/custom_fields" },
    ];
    let list: any[] = [];
    let rawSample: any = null;
    for (const t of tryPaths) {
      try {
        const data = await rdCrm(t.path, { query: t.query });
        const items = (Array.isArray(data) ? data : data?.custom_fields ?? data?.items ?? []) as any[];
        if (items.length > 0) {
          list = items;
          rawSample = items[0];
          break;
        }
      } catch (e) {
        // tenta o próximo
      }
    }

    // Filtra para deals (quando o endpoint é genérico)
    const dealFields = list.filter((f) => {
      const scope = String(f?.for ?? f?.applicable_for ?? f?.entity ?? "").toLowerCase();
      return !scope || scope === "deal" || scope === "deals";
    });
    const useList = dealFields.length > 0 ? dealFields : list;

    const fields = useList.map(parseCustomFieldDef).filter((x): x is RdCustomFieldDef => !!x);

    // Se algum campo tipado como lista veio sem opções, busca individualmente
    for (const f of fields) {
      const t = f.type.toLowerCase();
      const looksList =
        t.includes("list") ||
        t.includes("select") ||
        t.includes("choice") ||
        t.includes("dropdown") ||
        t.includes("radio") ||
        t.includes("multi");
      if (looksList && f.options.length === 0) {
        try {
          const d = await rdCrm(`/custom_fields/${encodeURIComponent(f.id)}`);
          const opts = (d?.custom_field_options ?? d?.options ?? []) as any[];
          f.options = opts
            .map((o) => ({
              id: String(o?._id ?? o?.id ?? o?.value ?? ""),
              label: String(o?.label ?? o?.name ?? o?.value ?? ""),
            }))
            .filter((o) => o.id || o.label);
        } catch {
          // mantém vazio
        }
      }
    }

    console.log("[RD CRM] custom fields sample raw:", JSON.stringify(rawSample)?.slice(0, 800));
    console.log("[RD CRM] parsed fields:", fields.map((f) => ({ label: f.label, type: f.type, options: f.options.length })));

    return { fields };
  });

/** Busca um deal pelo telefone do contato (se rd_deal_id ainda não foi vinculado). */
export const findRdDealByPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone: z.string().min(4) }).parse(d))
  .handler(async ({ data }) => {
    const phone = data.phone.replace(/[^\d+]/g, "");
    // tenta achar o contato por telefone
    const tryQueries: Array<Record<string, string>> = [
      { phone },
      { q: phone },
    ];
    let contact: RdContact | null = null;
    for (const q of tryQueries) {
      try {
        const json = await rdCrm("/contacts", { query: q });
        const list = (Array.isArray(json) ? json : json?.contacts ?? json?.items ?? []) as RdContact[];
        if (list.length > 0) {
          // pega o primeiro contato com telefone que bate
          contact = list.find((c) =>
            (c.phones ?? []).some((p) => normalizePhone(p.phone) === phone || normalizePhone(p.phone)?.endsWith(phone.slice(-8) ?? "")),
          ) ?? list[0];
          if (contact) break;
        }
      } catch (e) {
        // tenta próximo
      }
    }
    if (!contact) return { dealId: null as string | null };
    const contactId = String(contact._id ?? contact.id ?? "");
    if (!contactId) return { dealId: null };
    try {
      const dealsJson = await rdCrm("/deals", { query: { contact_id: contactId, limit: 50 } });
      const list = (Array.isArray(dealsJson) ? dealsJson : dealsJson?.deals ?? []) as RdDeal[];
      if (list.length === 0) return { dealId: null };
      const dealId = String(list[0]._id ?? list[0].id ?? "");
      return { dealId: dealId || null };
    } catch {
      return { dealId: null };
    }
  });

export type RdFieldValue = string | number | boolean | null | string[];
export type RdDealMirror = {
  id: string;
  name: string;
  stageId: string;
  stageName: string;
  pipelineId: string;
  pipelineName: string;
  customFields: Record<string, RdFieldValue>; // custom_field_id -> value
};

/** Busca um deal completo (com custom fields) para espelhar na UI. */
export const getRdDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const json = (await rdCrm(`/deals/${encodeURIComponent(data.dealId)}`)) as RdDeal;
    if (!json) throw new Error("Deal não encontrado");
    const customFields: Record<string, RdFieldValue> = {};
    const toFieldValue = (v: unknown): RdFieldValue => {
      if (v === null || v === undefined) return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      if (Array.isArray(v)) return v.map((x) => String(x));
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.label === "string") return o.label;
        if (typeof o.value === "string" || typeof o.value === "number") return o.value as RdFieldValue;
      }
      return String(v);
    };
    for (const f of json.deal_custom_fields ?? []) {
      const cfId = String(f.custom_field_id ?? f.custom_field?._id ?? f.custom_field?.id ?? "");
      if (cfId) customFields[cfId] = toFieldValue(f.value);
    }
    const stage = json.deal_stage;
    const mirror: RdDealMirror = {
      id: String(json._id ?? json.id ?? data.dealId),
      name: json.name ?? "",
      stageId: String(stage?._id ?? stage?.id ?? ""),
      stageName: stage?.name ?? "",
      pipelineId: String(stage?.deal_pipeline?._id ?? stage?.deal_pipeline?.id ?? stage?.deal_pipeline_id ?? ""),
      pipelineName: stage?.deal_pipeline?.name ?? "",
      customFields,
    };
    return { deal: mirror };
  });

/** Busca um deal e devolve dados do contato principal (nome + telefone). */
export const getRdDealContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const json = (await rdCrm(`/deals/${encodeURIComponent(data.dealId)}`)) as RdDeal;
    if (!json) throw new Error("Deal não encontrado");
    const c = json.contacts?.[0];
    const phoneRaw = c?.phones?.find((p) => p.phone)?.phone ?? c?.phones?.[0]?.phone ?? null;
    return {
      dealId: String(json._id ?? json.id ?? data.dealId),
      dealName: json.name ?? "",
      contactName: c?.name ?? json.name ?? "",
      contactPhone: normalizePhone(phoneRaw) ?? "",
    };
  });

/** Atualiza custom fields e/ou etapa de um deal no RD CRM. */
export const updateRdDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      dealId: z.string().min(1),
      stageId: z.string().optional(),
      customFields: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
      ).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const dealBody: Record<string, unknown> = {};
    if (data.stageId) dealBody.deal_stage_id = data.stageId;
    if (data.customFields) {
      dealBody.deal_custom_fields = Object.entries(data.customFields).map(([custom_field_id, value]) => ({
        custom_field_id,
        value,
      }));
    }
    if (Object.keys(dealBody).length === 0) return { ok: true };
    await rdCrm(`/deals/${encodeURIComponent(data.dealId)}`, {
      method: "PUT",
      body: JSON.stringify({ deal: dealBody }),
    });
    return { ok: true };
  });
