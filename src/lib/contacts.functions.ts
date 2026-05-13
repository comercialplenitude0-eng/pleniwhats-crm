import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureManager(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_manager_role", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas Admin/Gestor podem editar contatos.");
}

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as { supabase: any };
    const { data, error } = await supabase
      .from("contacts")
      .select("id, phone, name, avatar_url, email, wa_contact_id, notes, custom_fields, created_at, updated_at")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: row, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getContactByPhone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: z.string().min(3).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: row, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("phone", data.phone)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  phone: z.string().min(3).max(40),
  name: z.string().min(1).max(120),
  email: z.string().email().max(160).optional().nullable().or(z.literal("")),
  avatar_url: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  custom_fields: z.record(z.string().max(60), z.string().max(500)).optional(),
});

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureManager(supabase, userId);
    const payload = {
      phone: data.phone.trim(),
      name: data.name.trim(),
      email: data.email?.trim() || null,
      avatar_url: data.avatar_url?.trim() || null,
      notes: data.notes?.trim() || null,
      custom_fields: data.custom_fields ?? {},
    };
    if (data.id) {
      const { error } = await supabase.from("contacts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("contacts")
      .insert({ ...payload, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureManager(supabase, userId);
    const { error } = await supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
