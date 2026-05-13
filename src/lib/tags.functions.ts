import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureManager(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_manager_role", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas Admin/Gestor podem gerenciar tags.");
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const listTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as { supabase: any };
    const { data, error } = await supabase
      .from("tags")
      .select("id, name, slug, emoji, color, sort_order, is_system, created_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  emoji: z.string().max(8).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

export const upsertTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureManager(supabase, userId);
    if (data.id) {
      const { error } = await supabase
        .from("tags")
        .update({
          name: data.name,
          emoji: data.emoji ?? null,
          color: data.color,
          sort_order: data.sort_order ?? 0,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const baseSlug = slugify(data.name) || `tag-${Date.now()}`;
    let slug = baseSlug;
    for (let i = 2; i < 50; i++) {
      const { data: ex } = await supabase.from("tags").select("id").eq("slug", slug).maybeSingle();
      if (!ex) break;
      slug = `${baseSlug}-${i}`;
    }
    const { data: row, error } = await supabase
      .from("tags")
      .insert({
        name: data.name,
        slug,
        emoji: data.emoji ?? null,
        color: data.color,
        sort_order: data.sort_order ?? 100,
        is_system: false,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await ensureManager(supabase, userId);
    const { data: tag, error: fetchErr } = await supabase
      .from("tags")
      .select("is_system")
      .eq("id", data.id)
      .single();
    if (fetchErr) throw new Error(fetchErr.message);
    if (tag?.is_system) throw new Error("Tags do sistema não podem ser apagadas.");
    const { error } = await supabase.from("tags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listConversationTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: rows, error } = await supabase
      .from("conversation_tags")
      .select("tag_id, assigned_at, tags(id, name, slug, emoji, color)")
      .eq("conversation_id", data.conversationId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => r.tags).filter(Boolean);
  });

export const setConversationTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      conversationId: z.string().uuid(),
      tagIds: z.array(z.string().uuid()).max(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: existing, error: exErr } = await supabase
      .from("conversation_tags")
      .select("tag_id")
      .eq("conversation_id", data.conversationId);
    if (exErr) throw new Error(exErr.message);
    const current = new Set<string>((existing ?? []).map((r: any) => r.tag_id as string));
    const desired = new Set<string>(data.tagIds);
    const toAdd: string[] = [...desired].filter((id) => !current.has(id));
    const toRemove: string[] = [...current].filter((id) => !desired.has(id));
    if (toRemove.length) {
      const { error } = await supabase
        .from("conversation_tags")
        .delete()
        .eq("conversation_id", data.conversationId)
        .in("tag_id", toRemove);
      if (error) throw new Error(error.message);
    }
    if (toAdd.length) {
      const { error } = await supabase
        .from("conversation_tags")
        .insert(
          toAdd.map((tag_id) => ({
            conversation_id: data.conversationId,
            tag_id,
            assigned_by: userId,
          })),
        );
      if (error) throw new Error(error.message);
    }
    return { ok: true, added: toAdd.length, removed: toRemove.length };
  });
