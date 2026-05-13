import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isManagerRole, type AppRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare, Inbox, Flame, CheckCircle2, Users, Clock,
  Loader2, LogOut, Timer, Target, TrendingUp, Trophy,
} from "lucide-react";
import { initials, LABEL_META, STATUS_LABEL, type Conversation, type ConvLabel, type ConvStatus, type Message } from "@/lib/inbox-types";
import { toast } from "sonner";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Profile = { id: string; name: string; email: string };
type RoleRow = { user_id: string; role: AppRole };
type RangeKey = "7d" | "14d" | "30d";

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "14d": 14, "30d": 30 };

function DashboardPage() {
  const { role, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [messages, setMessages] = useState<Pick<Message, "id" | "conversation_id" | "direction" | "created_at" | "sender_id">[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("14d");

  const load = useCallback(async () => {
    setLoading(true);
    const sinceIso = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [c, p, r, m] = await Promise.all([
      supabase.from("conversations").select("*").order("last_message_at", { ascending: false }),
      supabase.from("profiles").select("id,name,email"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("messages")
        .select("id,conversation_id,direction,created_at,sender_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(5000),
    ]);
    setConversations(c.data ?? []);
    setProfiles(p.data ?? []);
    setRoles((r.data ?? []) as RoleRow[]);
    setMessages(m.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const days = RANGE_DAYS[range];

  const metrics = useMemo(() => {
    const since = Date.now() - days * 86400_000;
    const recentConvs = conversations.filter((c) => new Date(c.last_message_at).getTime() >= since);
    const recentMsgs = messages.filter((m) => new Date(m.created_at).getTime() >= since);

    // Per-conversation first response time
    const byConv = new Map<string, typeof messages>();
    for (const msg of recentMsgs) {
      const arr = byConv.get(msg.conversation_id) ?? [];
      arr.push(msg);
      byConv.set(msg.conversation_id, arr);
    }
    const responseTimes: number[] = [];
    for (const arr of byConv.values()) {
      const firstIn = arr.find((m) => m.direction === "inbound");
      if (!firstIn) continue;
      const firstOut = arr.find((m) =>
        m.direction === "outbound" &&
        new Date(m.created_at).getTime() > new Date(firstIn.created_at).getTime()
      );
      if (!firstOut) continue;
      const diffMin = (new Date(firstOut.created_at).getTime() - new Date(firstIn.created_at).getTime()) / 60000;
      if (diffMin >= 0 && diffMin < 60 * 24 * 7) responseTimes.push(diffMin);
    }
    const avgResponseMin = responseTimes.length
      ? Math.round(responseTimes.reduce((s, n) => s + n, 0) / responseTimes.length)
      : 0;

    const closed = recentConvs.filter((c) => c.label === "closed" || c.status === "encerrada").length;
    const conversionRate = recentConvs.length ? Math.round((closed / recentConvs.length) * 100) : 0;

    // Daily series
    const series: { date: string; conversas: number; mensagens: number; respostas: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const dayMsgs = recentMsgs.filter((m) => {
        const t = new Date(m.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      series.push({
        date: key,
        conversas: conversations.filter((c) => {
          const t = new Date(c.created_at).getTime();
          return t >= d.getTime() && t < next.getTime();
        }).length,
        mensagens: dayMsgs.filter((m) => m.direction === "inbound").length,
        respostas: dayMsgs.filter((m) => m.direction === "outbound").length,
      });
    }

    return { recentConvs, avgResponseMin, conversionRate, closed, series, responseTimes };
  }, [conversations, messages, days]);

  if (!isManagerRole(role)) {
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

  const total = conversations.length;
  const unread = conversations.reduce((s, c) => s + c.unread_count, 0);
  const hot = conversations.filter((c) => c.label === "hot").length;
  const waiting = conversations.filter((c) => c.status === "aguardando").length;
  const inProgress = conversations.filter((c) => c.status === "em_atendimento").length;

  // Per-seller stats (no period filter, lifetime)
  const sellers = profiles.map((p) => {
    const userRoles = roles.filter((r) => r.user_id === p.id).map((r) => r.role);
    const userConvs = conversations.filter((c) => c.assigned_to === p.id);
    const userMsgs = messages.filter((m) => m.sender_id === p.id && m.direction === "outbound");
    const closedCount = userConvs.filter((c) => c.label === "closed" || c.status === "encerrada").length;
    const priority: AppRole[] = ["admin", "gestor", "cs", "comercial", "vendedor"];
    const pickedRole: AppRole = priority.find((p) => userRoles.includes(p)) ?? "comercial";
    return {
      ...p,
      role: pickedRole,
      total: userConvs.length,
      open: userConvs.filter((c) => c.status !== "encerrada").length,
      unread: userConvs.reduce((s, c) => s + c.unread_count, 0),
      hot: userConvs.filter((c) => c.label === "hot").length,
      closed: closedCount,
      messagesSent: userMsgs.length,
      conversion: userConvs.length ? Math.round((closedCount / userConvs.length) * 100) : 0,
    };
  });

  const ranking = [...sellers].sort((a, b) => b.closed - a.closed || b.messagesSent - a.messagesSent);
  const unassigned = conversations.filter((c) => !c.assigned_to);

  const labelDist = (Object.keys(LABEL_META) as ConvLabel[]).map((k) => ({
    name: LABEL_META[k].name,
    value: conversations.filter((c) => c.label === k).length,
    key: k,
  }));

  const labelColors: Record<ConvLabel, string> = {
    hot: "var(--color-label-hot)",
    warm: "var(--color-label-warm)",
    cold: "var(--color-label-cold)",
    new: "var(--color-label-new)",
    closed: "var(--color-label-closed)",
  };

  async function reassign(convId: string, userId: string | null) {
    const { error } = await supabase.from("conversations").update({ assigned_to: userId }).eq("id", convId);
    if (error) return toast.error(error.message);
    toast.success("Conversa reatribuída");
    void load();
  }

  async function toggleRole(userId: string, current: AppRole) {
    const newRole: AppRole = isManagerRole(current) ? "comercial" : "gestor";
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) return toast.error(delErr.message);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) return toast.error(error.message);
    toast.success(`Perfil atualizado para ${newRole}`);
    void load();
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-6 py-4 border-b bg-card flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Métricas · {profile?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <TabsList>
              <TabsTrigger value="7d">7 dias</TabsTrigger>
              <TabsTrigger value="14d">14 dias</TabsTrigger>
              <TabsTrigger value="30d">30 dias</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4 mr-2" /> Sair
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <Kpi icon={MessageSquare} label="Conversas" value={total} />
            <Kpi icon={Inbox} label="Não lidas" value={unread} accent="primary" />
            <Kpi icon={Clock} label="Aguardando" value={waiting} />
            <Kpi icon={Users} label="Em atend." value={inProgress} />
            <Kpi icon={Flame} label="Quentes" value={hot} accent="hot" />
            <Kpi icon={CheckCircle2} label="Fechadas" value={metrics.closed} sub={`${range}`} />
            <Kpi icon={Timer} label="Resp. média" value={metrics.avgResponseMin} suffix="min" />
            <Kpi icon={Target} label="Conversão" value={metrics.conversionRate} suffix="%" accent="primary" />
          </section>

          <AlertsPanel
            isGestor={isManagerRole(role)}
            ctx={{
              avgResponseMin: metrics.avgResponseMin,
              conversionRate: metrics.conversionRate,
              waiting,
              sellers: sellers.map((s) => ({ id: s.id, name: s.name, unread: s.unread })),
            }}
          />

          {/* Volume chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" />
                Volume — últimos {days} dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.series} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-label-warm)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-label-warm)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="mensagens" name="Recebidas" stroke="hsl(var(--primary))" fill="url(#gIn)" strokeWidth={2} />
                    <Area type="monotone" dataKey="respostas" name="Enviadas" stroke="var(--color-label-warm)" fill="url(#gOut)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Distribution + Ranking */}
          <section className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Distribuição por etiqueta</CardTitle></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={labelDist} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                        {labelDist.map((d) => (
                          <Cell key={d.key} fill={labelColors[d.key]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="size-4 text-amber-500" />
                  Ranking — fechadas por vendedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ranking.slice(0, 8).map((s) => ({ name: s.name.split(" ")[0], fechadas: s.closed, abertas: s.open }))}
                      margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="fechadas" fill="var(--color-label-closed)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="abertas" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Status breakdown bars */}
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
                        <div className="h-full" style={{ width: `${pct}%`, background: labelColors[k] }} />
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
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-right tabular-nums text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>

          {/* Sellers table */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Equipe — desempenho</CardTitle></CardHeader>
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
                    <TableHead className="text-right">Fechadas</TableHead>
                    <TableHead className="text-right">Msgs enviadas</TableHead>
                    <TableHead className="text-right">Conversão</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((s, idx) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => navigate({ to: "/team/$userId", params: { userId: s.id }, search: { range } })}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {idx < 3 && (
                            <Trophy className={`size-4 shrink-0 ${idx === 0 ? "text-amber-500" : idx === 1 ? "text-zinc-400" : "text-amber-700"}`} />
                          )}
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
                        <Badge variant={isManagerRole(s.role) ? "default" : "secondary"} className="capitalize">{s.role}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.open}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.unread > 0 ? <Badge>{s.unread}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.hot}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{s.closed}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{s.messagesSent}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant="outline">{s.conversion}%</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="sm"
                          onClick={(e) => { e.stopPropagation(); toggleRole(s.id, s.role); }}
                          disabled={s.id === profile?.id}
                          title={s.id === profile?.id ? "Não é possível alterar seu próprio perfil" : ""}
                        >
                          {isManagerRole(s.role) ? "Tornar comercial" : "Promover a gestor"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Unassigned */}
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
  icon: Icon, label, value, accent, suffix, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: "primary" | "hot";
  suffix?: string;
  sub?: string;
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
        <div className="mt-1 text-2xl font-semibold tabular-nums">
          {value}{suffix ? <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span> : null}
        </div>
        {sub && <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{sub}</div>}
      </CardContent>
    </Card>
  );
}
