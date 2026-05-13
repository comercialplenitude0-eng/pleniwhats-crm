import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RD_CRM_BASE = "https://crm.rdstation.com/api/v1";

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^\d+]/g, "");
  return digits.length >= 8 ? digits : null;
}

async function rdCrm(path: string) {
  const token = process.env.RD_CRM_TOKEN || process.env.RD_STATION_API_TOKEN;
  if (!token) throw new Error("RD_CRM_TOKEN não configurado");
  const url = new URL(`${RD_CRM_BASE}${path}`);
  url.searchParams.set("token", token);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`RD CRM ${res.status}`);
  return res.json();
}

type AnyObj = Record<string, any>;

function pickCustomFieldValue(deal: AnyObj, cfId: string): string | null {
  for (const f of (deal?.deal_custom_fields ?? []) as AnyObj[]) {
    const id = String(f.custom_field_id ?? f.custom_field?._id ?? f.custom_field?.id ?? "");
    if (id !== cfId) continue;
    const v = f.value;
    if (v == null) return null;
    if (typeof v === "string" || typeof v === "number") return String(v).trim();
    if (Array.isArray(v)) return v.map(String).join(", ").trim();
    if (typeof v === "object") {
      if (typeof v.label === "string") return v.label.trim();
      if (typeof v.value === "string" || typeof v.value === "number") return String(v.value).trim();
    }
    return String(v).trim();
  }
  return null;
}

function extractDealId(payload: AnyObj): string | null {
  // tenta vários formatos comuns de webhook do RD CRM
  const candidates = [
    payload?.deal?._id,
    payload?.deal?.id,
    payload?._id,
    payload?.id,
    payload?.data?._id,
    payload?.data?.id,
    payload?.entity?._id,
    payload?.entity?.id,
  ];
  for (const c of candidates) {
    if (c) return String(c);
  }
  return null;
}

export const Route = createFileRoute("/api/public/hooks/rd-deal-created")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const courseFieldId = process.env.RD_COURSE_CUSTOM_FIELD_ID || null;

        let payload: AnyObj = {};
        try { payload = await request.json(); } catch { /* aceita vazio */ }

        // Resolve o deal: se o webhook já trouxer tudo, usa; senão busca pelo id
        let deal: AnyObj | null = payload?.deal ?? payload?.data ?? null;
        const needsFetch =
          !deal ||
          !deal.deal_custom_fields ||
          !(Array.isArray(deal.contacts) && deal.contacts.length > 0);

        if (needsFetch) {
          const dealId = extractDealId(payload);
          if (!dealId) {
            return Response.json({ ok: false, error: "deal id não encontrado no payload" }, { status: 400 });
          }
          try {
            deal = await rdCrm(`/deals/${encodeURIComponent(dealId)}`);
          } catch (e: any) {
            return Response.json({ ok: false, error: e?.message ?? "erro ao buscar deal" }, { status: 502 });
          }
        }

        if (!deal) return Response.json({ ok: false, error: "deal vazio" }, { status: 400 });

        const dealId = String(deal._id ?? deal.id ?? "");
        const dealCreatedAt = String(deal.created_at ?? deal.updated_at ?? new Date().toISOString());
        const contact = (deal.contacts ?? [])[0] as AnyObj | undefined;
        const phoneRaw = contact?.phones?.find((p: AnyObj) => p?.phone)?.phone ?? contact?.phones?.[0]?.phone;
        const phone = normalizePhone(phoneRaw);

        const course = courseFieldId ? pickCustomFieldValue(deal, courseFieldId) : null;

        if (!phone) {
          return Response.json({ ok: true, skipped: "sem telefone no contato do deal", dealId });
        }

        // Procura conversas do mesmo lead (telefone). Tenta match exato + sufixo (últimos 8 dígitos)
        const tail = phone.slice(-8);
        const { data: convos, error } = await supabaseAdmin
          .from("conversations")
          .select("id, contact_phone, course, rd_deal_id, last_message_at")
          .or(`contact_phone.eq.${phone},contact_phone.ilike.%${tail}`);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const matches = (convos ?? []).filter((c) => {
          const np = normalizePhone(c.contact_phone);
          return np === phone || (np && np.endsWith(tail));
        });

        if (matches.length === 0) {
          return Response.json({ ok: true, updated: 0, dealId, phone, note: "nenhuma conversa existente" });
        }

        // Atualiza o curso de todas as conversas desse lead com o curso do card mais novo,
        // e vincula rd_deal_id quando ainda não houver.
        const updates: Array<{ id: string; status: string }> = [];
        for (const c of matches) {
          const patch: Record<string, unknown> = {};
          if (course && course !== c.course) patch.course = course;
          if (!c.rd_deal_id && dealId) patch.rd_deal_id = dealId;
          if (Object.keys(patch).length === 0) {
            updates.push({ id: c.id, status: "noop" });
            continue;
          }
          const { error: upErr } = await supabaseAdmin
            .from("conversations")
            .update(patch)
            .eq("id", c.id);
          updates.push({ id: c.id, status: upErr ? `error:${upErr.message}` : "updated" });
        }

        return Response.json({
          ok: true,
          dealId,
          dealCreatedAt,
          phone,
          course,
          updated: updates.filter((u) => u.status === "updated").length,
          results: updates,
        });
      },
      GET: async () => Response.json({
        ok: true,
        hint: "Configure este URL como webhook no RD CRM para o evento 'Negócio criado'. Faz POST com JSON contendo o deal (ou apenas o id).",
      }),
    },
  },
});
