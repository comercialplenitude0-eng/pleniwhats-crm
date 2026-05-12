import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  role: z.enum(["vendedor", "gestor"]),
  password: z.string().min(8).max(72),
});

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is gestor (RLS-respecting)
    const { data: isGestor, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "gestor",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isGestor) throw new Response("Forbidden", { status: 403 });

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

    // handle_new_user trigger inserts profile + 'vendedor' role.
    // If gestor requested, swap role.
    if (data.role === "gestor") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newId, role: "gestor" });
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

    const { data: isGestor } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Response("Forbidden", { status: 403 });

    // Unassign their conversations
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
    const { data: isGestor } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Response("Forbidden", { status: 403 });

    const { error, count } = await supabaseAdmin
      .from("conversations")
      .update({ assigned_to: data.to_user_id }, { count: "exact" })
      .eq("assigned_to", data.from_user_id);
    if (error) throw new Error(error.message);
    return { moved: count ?? 0 };
  });
