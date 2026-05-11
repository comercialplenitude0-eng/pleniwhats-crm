import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Inbox, Flame, CheckCircle2, Users, Clock, Loader2, LogOut } from "lucide-react";
import { initials, LABEL_META, STATUS_LABEL, type Conversation, type ConvLabel, type ConvStatus } from "@/lib/inbox-types";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Profile = { id: string; name: string; email: string };
type RoleRow = { user_id: string; role: "vendedor" | "gestor" };

function DashboardPage() {
  const { role, profile, signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p, r] = await Promise.all([
      supabase.from("conversations").select("*").order("last_message_at", { ascending: false }),
      supabase.from("profiles").select("id,name,email"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    setConversations(c.data ?? []);
    setProfiles(p.data ?? []);
    setRoles((r.data ?? []) as RoleRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (role !== "gestor") {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Acesso restrito</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apenas usuários com perfil de <strong>gestor</strong> podem ver o dashboard.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // KPIs
  const total = conversations.length;
  const unread = conversations.reduce((s, c) => s + c.unread_count, 0);
  const hot = conversations.filter((c) => c.label === "hot").length;
  const closed = conversations.filter((c) => c.status === "encerrada").length;
  const waiting = conversations.filter((c) => c.status === "aguardando").length;
  const inProgress = conversations.filter((c) => c.status === "em_atendimento").length;

  // Per-seller stats
  const sellers = profiles.map((p) => {
    const userRoles = roles.filter((r) => r.user_id === p.id).map((r) => r.role);
    const userConvs = conversations.filter((c) => c.assigned_to === p.id);
    return {
      ...p,
      role: userRoles.includes("gestor") ? "gestor" : "vendedor",
      total: userConvs.length,
      open: userConvs.filter((c) => c.status !== "encerrada").length,
      unread: userConvs.reduce((s, c) => s + c.unread_count, 0),
      hot: userConvs.filter((c) => c.label === "hot").length,
    };
  });

  const unassigned = conversations.filter((c) => !c.assigned_to);

  async function reassign(convId: string, userId: string | null) {
    const { error } = await supabase
      .from("conversations")
      .update({ assigned_to: userId })
      .eq("id", convId);
    if (error) return toast.error(error.message);
    toast.success("Conversa reatribuída");
    void load();
  }

  async function toggleRole(userId: string, current: string) {
    const newRole = current === "gestor" ? "vendedor" : "gestor";
    // remove existing role(s)
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) return toast.error(delErr.message);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) return toast.error(error.message);
    toast.success(`Perfil atualizado para ${newRole}`);
    void load();
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b bg-card flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Visão geral · {profile?.name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4 mr-2" /> Sair
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={MessageSquare} label="Conversas" value={total} />
            <Kpi icon={Inbox} label="Não lidas" value={unread} accent="primary" />
            <Kpi icon={Clock} label="Aguardando" value={waiting} />
            <Kpi icon={Users} label="Em atendimento" value={inProgress} />
            <Kpi icon={Flame} label="Quentes" value={hot} accent="hot" />
            <Kpi icon={CheckCircle2} label="Encerradas" value={closed} />
          </section>

          {/* Status breakdown */}
          <section className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Por etiqueta</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(Object.keys(LABEL_META) as ConvLabel[]).map((k) => {
                  const count = conversations.filter((c) => c.label === k).length;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  const m = LABEL_META[k];
                  return (
                    <div key={k} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0">{m.emoji} {m.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-right tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Por status</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(Object.keys(STATUS_LABEL) as ConvStatus[]).map((k) => {
                  const count = conversations.filter((c) => c.status === k).length;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={k} className="flex items-center gap-3 text-sm">
                      <span className="w-32 shrink-0">{STATUS_LABEL[k]}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-secondary-foreground/60" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-right tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>

          {/* Sellers */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Equipe</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="text-right">Conversas</TableHead>
                    <TableHead className="text-right">Abertas</TableHead>
                    <TableHead className="text-right">Não lidas</TableHead>
                    <TableHead className="text-right">Quentes</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs bg-secondary">{initials(s.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{s.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.role === "gestor" ? "default" : "secondary"} className="capitalize">
                          {s.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.open}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.unread > 0 ? <Badge>{s.unread}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.hot}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRole(s.id, s.role)}
                          disabled={s.id === profile?.id}
                          title={s.id === profile?.id ? "Não é possível alterar seu próprio perfil" : ""}
                        >
                          {s.role === "gestor" ? "Tornar vendedor" : "Promover a gestor"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Unassigned conversations */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Conversas sem responsável</span>
                <Badge variant="secondary">{unassigned.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {unassigned.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Todas as conversas estão atribuídas. 🎉
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contato</TableHead>
                      <TableHead>Última mensagem</TableHead>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead>Atribuir a</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassigned.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{c.contact_name}</div>
                          <div className="text-xs text-muted-foreground">{c.contact_phone}</div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="text-sm truncate">{c.last_message ?? "—"}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{LABEL_META[c.label].emoji} {LABEL_META[c.label].name}</span>
                        </TableCell>
                        <TableCell>
                          <Select onValueChange={(v) => reassign(c.id, v)}>
                            <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                            <SelectContent>
                              {profiles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: "primary" | "hot";
}) {
  const color =
    accent === "primary" ? "text-primary" :
    accent === "hot" ? "text-[var(--color-label-hot)]" :
    "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className={`size-4 ${color}`} />
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
