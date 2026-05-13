import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RoleEnum = z.enum(["admin", "gestor", "comercial", "cs"]);

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  role: RoleEnum,
  password: z.string().min(8).max(72),
});

async function assertManager(supabase: typeof import("@supabase/supabase-js").SupabaseClient.prototype, userId: string) {
  const { data, error } = await supabase.rpc("is_manager_role", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase as never, userId);

    // Create the auth user (auto-confirmed)
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { name: data.name },
      });
    if (createErr) throw new Error(createErr.message);
    const newId = created.user!.id;

    // handle_new_user trigger inserts profile + 'comercial' role.
    // If a different role was requested, swap it.
    if (data.role !== "comercial") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newId, role: data.role });
    }

    return { id: newId, email: data.email };
  });

const RemoveSchema = z.object({ user_id: z.string().uuid() });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RemoveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.user_id === userId) throw new Error("Você não pode remover a si mesmo");
    await assertManager(supabase as never, userId);

    await supabaseAdmin
      .from("conversations")
      .update({ assigned_to: null })
      .eq("assigned_to", data.user_id);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ReassignAllSchema = z.object({
  from_user_id: z.string().uuid(),
  to_user_id: z.string().uuid().nullable(),
});

export const reassignAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ReassignAllSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase as never, userId);

    const { error, count } = await supabaseAdmin
      .from("conversations")
      .update({ assigned_to: data.to_user_id }, { count: "exact" })
      .eq("assigned_to", data.from_user_id);
    if (error) throw new Error(error.message);
    return { moved: count ?? 0 };
  });

const SetRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: RoleEnum,
});

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetRoleSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase as never, userId);

    // Prevent removing the last manager
    if (data.role !== "admin" && data.role !== "gestor") {
      const { data: managers } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "gestor"]);
      const ids = new Set((managers ?? []).map((m) => m.user_id));
      ids.delete(data.user_id);
      if (ids.size === 0) {
        throw new Error("Não é possível remover o último gerente (Admin/Gestor).");
      }
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
