import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isManagerRole, type AppRole } from "@/lib/auth";
import { inviteMember, removeMember, reassignAll } from "@/lib/team.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  UserPlus,
  Trash2,
  Shield,
  Copy,
  ArrowRightLeft,
} from "lucide-react";
import { initials } from "@/lib/inbox-types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

type Profile = { id: string; name: string; email: string };
type Role = "admin" | "gestor" | "comercial" | "cs" | "vendedor";

const ROLE_OPTIONS: Array<{ value: Exclude<Role, "vendedor">; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "gestor", label: "Gestor" },
  { value: "comercial", label: "Comercial" },
  { value: "cs", label: "CS" },
];

function roleLabelLocal(r: Role): string {
  switch (r) {
    case "admin": return "Admin";
    case "gestor": return "Gestor";
    case "cs": return "CS";
    default: return "Comercial";
  }
}

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function TeamPage() {
  const { role, profile } = useAuth();
  const invite = useServerFn(inviteMember);
  const remove = useServerFn(removeMember);
  const reassign = useServerFn(reassignAll);

  const [members, setMembers] = useState<
    Array<Profile & { role: Role; convCount: number }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, r, c] = await Promise.all([
      supabase.from("profiles").select("id,name,email"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("conversations").select("assigned_to"),
    ]);
    const profiles = (p.data ?? []) as Profile[];
    const roles = (r.data ?? []) as { user_id: string; role: Role }[];
    const convs = (c.data ?? []) as { assigned_to: string | null }[];
    setMembers(
      profiles.map((pr) => {
        const userRoles = roles.filter((x) => x.user_id === pr.id).map((x) => x.role);
        const priority: Role[] = ["admin", "gestor", "cs", "comercial", "vendedor"];
        const picked: Role = priority.find((p) => userRoles.includes(p)) ?? "comercial";
        return {
          ...pr,
          role: picked,
          convCount: convs.filter((cv) => cv.assigned_to === pr.id).length,
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isManagerRole(role)) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Acesso restrito</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apenas <strong>gestores</strong> podem gerenciar a equipe.
          </CardContent>
        </Card>
      </div>
    );
  }

  async function toggleRole(userId: string, current: Role) {
    const newRole: Role = isManagerRole(current) ? "comercial" : "gestor";
    const { error: dErr } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (dErr) return toast.error(dErr.message);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: newRole });
    if (error) return toast.error(error.message);
    toast.success(`Perfil atualizado para ${roleLabelLocal(newRole)}`);
    void load();
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b bg-card flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold">Equipe</h1>
          <p className="text-xs text-muted-foreground">
            {members.length} {members.length === 1 ? "membro" : "membros"}
          </p>
        </div>
        <InviteDialog
          onInvite={async (payload) => {
            await invite({ data: payload });
            await load();
          }}
        />
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-3">
          {loading ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            members.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <Avatar className="size-11 shrink-0">
                      <AvatarFallback className="bg-secondary">
                        {initials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{m.name}</span>
                        {m.id === profile?.id && (
                          <Badge variant="outline" className="text-xs">você</Badge>
                        )}
                        <Badge
                          variant={isManagerRole(m.role) ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {isManagerRole(m.role) && <Shield className="size-3 mr-1" />}
                          {roleLabelLocal(m.role)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {m.email} · {m.convCount}{" "}
                        {m.convCount === 1 ? "conversa" : "conversas"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2 justify-end shrink-0 flex-wrap">
                    {m.convCount > 0 && (
                      <ReassignDialog
                        from={m}
                        candidates={members.filter((x) => x.id !== m.id)}
                        onReassign={async (toId) => {
                          const res = await reassign({
                            data: { from_user_id: m.id, to_user_id: toId },
                          });
                          toast.success(`${res.moved} conversa(s) transferida(s)`);
                          await load();
                        }}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRole(m.id, m.role)}
                      disabled={m.id === profile?.id}
                    >
                      {isManagerRole(m.role) ? "Tornar vendedor" : "Promover"}
                    </Button>
                    {m.id !== profile?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            title="Remover membro"
                            aria-label="Remover membro"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover {m.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O acesso será revogado e suas conversas atribuídas
                              ficarão sem responsável. Esta ação não pode ser
                              desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  await remove({ data: { user_id: m.id } });
                                  toast.success("Membro removido");
                                  await load();
                                } catch (e) {
                                  toast.error((e as Error).message);
                                }
                              }}
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function InviteDialog({
  onInvite,
}: {
  onInvite: (p: {
    email: string;
    name: string;
    role: Role;
    password: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleVal, setRoleVal] = useState<Role>("vendedor");
  const [password, setPassword] = useState(() => randomPassword());
  const [submitting, setSubmitting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setRoleVal("vendedor");
    setPassword(randomPassword());
    setCreatedCreds(null);
  }

  async function submit() {
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Preencha nome, e-mail e senha (mín. 8)");
      return;
    }
    setSubmitting(true);
    try {
      await onInvite({ name: name.trim(), email: email.trim(), role: roleVal, password });
      setCreatedCreds({ email: email.trim(), password });
      toast.success("Membro criado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4 mr-2" /> Convidar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            Crie uma conta para um novo vendedor ou gestor. Compartilhe a senha
            inicial — ele poderá alterá-la depois.
          </DialogDescription>
        </DialogHeader>

        {createdCreds ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">E-mail: </span>
                {createdCreds.email}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="text-muted-foreground">Senha: </span>
                  <code className="font-mono">{createdCreds.password}</code>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `E-mail: ${createdCreds.email}\nSenha: ${createdCreds.password}`,
                    );
                    toast.success("Copiado");
                  }}
                >
                  <Copy className="size-3.5 mr-1" /> Copiar
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => reset()}>
                Convidar outro
              </Button>
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select
                  value={roleVal}
                  onValueChange={(v) => setRoleVal(v as Role)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Senha inicial</Label>
                <div className="flex gap-2">
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setPassword(randomPassword())}
                    title="Gerar nova senha"
                  >
                    ↻
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                Criar membro
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  from,
  candidates,
  onReassign,
}: {
  from: { id: string; name: string; convCount: number };
  candidates: Array<{ id: string; name: string }>;
  onReassign: (toUserId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>("__none");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Transferir conversas">
          <ArrowRightLeft className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir conversas de {from.name}</DialogTitle>
          <DialogDescription>
            {from.convCount} conversa(s) serão movidas. Escolha um destino ou
            deixe sem responsável.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Destinatário</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sem responsável</SelectItem>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onReassign(target === "__none" ? null : target);
                setOpen(false);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
