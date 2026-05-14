import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH_VERSION = "v21.0";

const ButtonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
  z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.string().url() }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phone_number: z.string().min(3).max(20) }),
]);

const TemplateInput = z.object({
  account_id: z.string().uuid(),
  name: z.string().min(1).max(512).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e _"),
  language: z.string().min(2).max(10).default("pt_BR"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  header_type: z.enum(["NONE", "TEXT"]).default("NONE"),
  header_text: z.string().max(60).optional().nullable(),
  body_text: z.string().min(1).max(1024),
  footer_text: z.string().max(60).optional().nullable(),
  buttons: z.array(ButtonSchema).max(10).default([]),
  body_examples: z.array(z.string()).default([]),
  header_example: z.string().optional().nullable(),
});

type TemplateInputT = z.infer<typeof TemplateInput>;

async function getAccountCreds(accountId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("access_token, business_account_id, display_name")
    .eq("id", accountId)
    .maybeSingle();
  if (error || !data) throw new Error("Conta WhatsApp não encontrada");
  if (!data.access_token || !data.business_account_id) {
    throw new Error("Conta sem WABA ID ou access_token configurado");
  }
  return { token: data.access_token, wabaId: data.business_account_id };
}

function buildComponents(input: TemplateInputT) {
  const components: Array<Record<string, unknown>> = [];

  if (input.header_type === "TEXT" && input.header_text) {
    const header: Record<string, unknown> = {
      type: "HEADER",
      format: "TEXT",
      text: input.header_text,
    };
    if (input.header_example && /\{\{1\}\}/.test(input.header_text)) {
      header.example = { header_text: [input.header_example] };
    }
    components.push(header);
  }

  const body: Record<string, unknown> = { type: "BODY", text: input.body_text };
  const varsCount = Array.from(input.body_text.matchAll(/\{\{(\d+)\}\}/g)).length;
  if (varsCount > 0 && input.body_examples.length > 0) {
    body.example = { body_text: [input.body_examples.slice(0, varsCount)] };
  }
  components.push(body);

  if (input.footer_text) {
    components.push({ type: "FOOTER", text: input.footer_text });
  }

  if (input.buttons.length > 0) {
    components.push({ type: "BUTTONS", buttons: input.buttons });
  }

  return components;
}

export const listWaTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("whatsapp_message_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const submitWaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TemplateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { token, wabaId } = await getAccountCreds(data.account_id);

    const components = buildComponents(data);

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data.name,
          language: data.language,
          category: data.category,
          components,
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      error?: { message?: string; error_user_msg?: string };
    };
    if (!res.ok) {
      throw new Error(json?.error?.error_user_msg ?? json?.error?.message ?? `Meta API ${res.status}`);
    }

    const status = (json.status ?? "PENDING").toLowerCase() as
      | "pending" | "approved" | "rejected" | "paused" | "disabled";

    const { data: row, error: insErr } = await supabaseAdmin
      .from("whatsapp_message_templates")
      .insert({
        account_id: data.account_id,
        name: data.name,
        language: data.language,
        category: data.category,
        header_type: data.header_type === "TEXT" ? "TEXT" : null,
        header_text: data.header_type === "TEXT" ? data.header_text ?? null : null,
        body_text: data.body_text,
        footer_text: data.footer_text ?? null,
        buttons: data.buttons,
        example: {
          header: data.header_example ?? null,
          body: data.body_examples,
        },
        meta_template_id: json.id ?? null,
        status,
        last_sync_at: new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return row;
  });

export const syncWaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ account_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { token, wabaId } = await getAccountCreds(data.account_id);
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?fields=name,language,status,id,category,rejected_reason&limit=200`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id: string; name: string; language: string; status: string; rejected_reason?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(json?.error?.message ?? `Meta API ${res.status}`);

    let updated = 0;
    for (const t of json.data ?? []) {
      const { error } = await supabaseAdmin
        .from("whatsapp_message_templates")
        .update({
          status: t.status.toLowerCase() as "pending" | "approved" | "rejected" | "paused" | "disabled",
          meta_template_id: t.id,
          rejection_reason: t.rejected_reason ?? null,
          last_sync_at: new Date().toISOString(),
        })
        .eq("account_id", data.account_id)
        .eq("name", t.name)
        .eq("language", t.language);
      if (!error) updated++;
    }
    return { ok: true, updated, total: json.data?.length ?? 0 };
  });

export const deleteWaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error: fErr } = await supabase
      .from("whatsapp_message_templates")
      .select("id, account_id, name, meta_template_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr || !row) throw new Error("Template não encontrado");

    // Tenta apagar na Meta (não bloqueia se falhar)
    try {
      const { token, wabaId } = await getAccountCreds(row.account_id);
      await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(row.name)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      // ignore
    }

    const { error } = await supabase
      .from("whatsapp_message_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
