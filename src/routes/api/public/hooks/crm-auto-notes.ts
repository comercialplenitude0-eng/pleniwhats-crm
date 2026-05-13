import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RD_CRM_BASE = "https://crm.rdstation.com/api/v1";

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^\d+]/g, "");
  return digits.length >= 8 ? digits : null;
}

function rdId(item?: { _id?: string; id?: string } | null) {
  return String(item?._id ?? item?.id ?? "");
}

async function rdCrm(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {},
) {
  const token = process.env.RD_CRM_TOKEN || process.env.RD_STATION_API_TOKEN;
  if (!token) throw new Error("RD_CRM_TOKEN não configurado");
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
    throw new Error(`RD CRM ${res.status}: ${txt.slice(0, 200) || res.statusText}`);
  }
  if (res.status === 204) return null;
  const txt = await res.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return txt; }
}

type RdContact = { _id?: string; id?: string; name?: string; phones?: Array<{ phone?: string }>; emails?: Array<{ email?: string }> };
type RdDeal = {
  _id?: string;
  id?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  contacts?: RdContact[];
  deal_custom_fields?: Array<{
    custom_field_id?: string;
    value?: unknown;
    custom_field?: { _id?: string; id?: string; label?: string };
  }>;
};

function customFieldValue(deal: RdDeal, cfId: string): string | null {
  for (const f of deal.deal_custom_fields ?? []) {
    const id = String(f.custom_field_id ?? f.custom_field?._id ?? f.custom_field?.id ?? "");
    if (id !== cfId) continue;
    const v = f.value;
    if (v == null) return null;
    if (typeof v === "string" || typeof v === "number") return String(v).trim();
    if (Array.isArray(v)) return v.map(String).join(", ").trim();
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.label === "string") return o.label.trim();
      if (typeof o.value === "string" || typeof o.value === "number") return String(o.value).trim();
    }
    return String(v).trim();
  }
  return null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

async function findMatchingDeal(opts: {
  phone: string;
  course: string | null;
  courseFieldId: string | null;
}): Promise<{ dealId: string | null; matched: "exact" | "fallback" | "none" }> {
  // 1) localizar contato pelo telefone
  let contact: RdContact | null = null;
  for (const q of [{ phone: opts.phone }, { q: opts.phone }] as Array<Record<string, string>>) {
    try {
      const json = await rdCrm("/contacts", { query: q });
      const list = (Array.isArray(json) ? json : json?.contacts ?? json?.items ?? []) as RdContact[];
      contact = list.find((c) =>
        (c.phones ?? []).some((p) => {
          const np = normalizePhone(p.phone);
          return np === opts.phone || (np && np.endsWith(opts.phone.slice(-8)));
        }),
      ) ?? list[0] ?? null;
      if (contact) break;
    } catch { /* tenta próximo */ }
  }
  if (!contact) return { dealId: null, matched: "none" };
  const contactId = rdId(contact);
  if (!contactId) return { dealId: null, matched: "none" };

  // 2) listar deals desse contato
  const dealsJson = await rdCrm("/deals", { query: { contact_id: contactId, limit: 100 } });
  const list = (Array.isArray(dealsJson) ? dealsJson : dealsJson?.deals ?? []) as RdDeal[];
  if (list.length === 0) return { dealId: null, matched: "none" };

  // 3) se temos curso + campo configurado, tenta match exato
  if (opts.course && opts.courseFieldId) {
    const target = norm(opts.course);
    for (const d of list) {
      // o deal listado pode não trazer custom fields - busca completa
      let full = d;
      if (!full.deal_custom_fields) {
        try { full = (await rdCrm(`/deals/${encodeURIComponent(rdId(d))}`)) as RdDeal; } catch { continue; }
      }
      const cv = customFieldValue(full, opts.courseFieldId);
      if (cv && norm(cv) === target) return { dealId: rdId(full), matched: "exact" };
    }
  }

  // 4) fallback: deal mais recente
  const sorted = [...list].sort((a, b) =>
    String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")),
  );
  return { dealId: rdId(sorted[0]), matched: "fallback" };
}

async function summarizeWithAI(opts: {
  contactName: string;
  course: string | null;
  messages: Array<{ direction: string; content: string | null; created_at: string }>;
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const transcript = opts.messages
    .map((m) => `[${new Date(m.created_at).toLocaleString("pt-BR")}] ${m.direction === "inbound" ? "Lead" : "Atendente"}: ${m.content ?? "[mídia]"}`)
    .join("\n");
  const sys = "Você é um analista comercial. Resuma a conversa de WhatsApp em português, de forma objetiva, com: 1) intenção do lead, 2) pontos-chave discutidos, 3) objeções/dúvidas, 4) próximos passos sugeridos. Máximo 10 linhas.";
  const user = `Lead: ${opts.contactName}\nCurso: ${opts.course ?? "(não informado)"}\n\nTranscrição:\n${transcript || "(sem mensagens)"}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim() || "(sem resumo)";
}

async function postDealNote(dealId: string, text: string): Promise<void> {
  // Tenta o endpoint de notes; se falhar, cria como activity do tipo nota
  try {
    await rdCrm(`/deals/${encodeURIComponent(dealId)}/notes`, {
      method: "POST",
      body: JSON.stringify({ note: { text } }),
    });
    return;
  } catch (e) {
    console.warn("[crm-auto-notes] /notes falhou, tentando /activities:", (e as Error).message);
  }
  await rdCrm(`/activities`, {
    method: "POST",
    body: JSON.stringify({ activity: { type: "note", text, deal_id: dealId } }),
  });
}

export const Route = createFileRoute("/api/public/hooks/crm-auto-notes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Aceita chamada do pg_cron (apikey header) ou anônima — endpoint /api/public/* é público.
        const courseFieldId = process.env.RD_COURSE_CUSTOM_FIELD_ID || null;
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Conversas elegíveis: > 24h sem mensagem nova E
        // (nunca anotadas OU a última anotação é anterior à última mensagem E também > 24h atrás)
        const { data: convos, error } = await supabaseAdmin
          .from("conversations")
          .select("id, contact_name, contact_phone, course, rd_deal_id, last_message_at, last_crm_note_at")
          .lt("last_message_at", cutoff)
          .limit(50);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const eligible = (convos ?? []).filter((c) => {
          if (!c.last_crm_note_at) return true;
          // anotada depois da última msg => já cobriu este ciclo
          if (new Date(c.last_crm_note_at) >= new Date(c.last_message_at)) return false;
          // garante 24h desde a última anotação para próximo ciclo
          return new Date(c.last_crm_note_at).getTime() < Date.now() - 24 * 60 * 60 * 1000;
        });

        const results: Array<{ id: string; status: string; deal?: string | null; matched?: string; error?: string }> = [];

        for (const c of eligible) {
          try {
            const phone = normalizePhone(c.contact_phone);
            if (!phone) {
              results.push({ id: c.id, status: "skipped", error: "telefone inválido" });
              continue;
            }

            // resolver dealId
            let dealId = c.rd_deal_id ?? null;
            let matched: "exact" | "fallback" | "none" = dealId ? "exact" : "none";
            if (!dealId) {
              const r = await findMatchingDeal({ phone, course: c.course, courseFieldId });
              dealId = r.dealId;
              matched = r.matched;
              if (dealId) {
                await supabaseAdmin
                  .from("conversations")
                  .update({ rd_deal_id: dealId })
                  .eq("id", c.id);
              }
            }
            if (!dealId) {
              results.push({ id: c.id, status: "no-deal", matched });
              continue;
            }

            // carregar mensagens (limite razoável)
            const { data: msgs } = await supabaseAdmin
              .from("messages")
              .select("direction, content, created_at")
              .eq("conversation_id", c.id)
              .order("created_at", { ascending: true })
              .limit(200);

            const summary = await summarizeWithAI({
              contactName: c.contact_name,
              course: c.course,
              messages: (msgs ?? []) as any,
            });

            const header = `📌 Resumo automático (24h sem interação) — ${new Date().toLocaleString("pt-BR")}\nCurso: ${c.course ?? "(não informado)"}${matched === "fallback" ? "\n⚠️ Card escolhido por fallback (sem match exato de curso)." : ""}\n\n`;

            await postDealNote(dealId, header + summary);

            await supabaseAdmin
              .from("conversations")
              .update({ last_crm_note_at: new Date().toISOString() })
              .eq("id", c.id);

            results.push({ id: c.id, status: "noted", deal: dealId, matched });
          } catch (e: any) {
            console.error("[crm-auto-notes] erro:", c.id, e?.message);
            results.push({ id: c.id, status: "error", error: e?.message ?? String(e) });
          }
        }

        return Response.json({
          ok: true,
          scanned: convos?.length ?? 0,
          eligible: eligible.length,
          processed: results.length,
          results,
        });
      },
      GET: async () => Response.json({ ok: true, hint: "POST para executar a varredura" }),
    },
  },
});
