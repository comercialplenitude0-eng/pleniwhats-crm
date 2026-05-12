import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Loader2, MessageSquare, Timer, Target, CheckCircle2,
  Flame, Inbox, Send, Clock, ArrowRightLeft, X, Search,
} from "lucide-react";
import {
  initials, formatTime, LABEL_META, STATUS_LABEL,
  type Conversation, type Message, type ConvLabel, type ConvStatus,
} from "@/lib/inbox-types";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { toast } from "sonner";

type RangeKey = "7d" | "14d" | "30d";
const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "14d": 14, "30d": 30 };

const searchSchema = z.object({
  range: z.enum(["7d", "14d", "30d"]).catch("14d"),
});

export const Route = createFileRoute("/_authenticated/team/$userId")({
  validateSearch: searchSchema,
  component: SellerDetailsPage,
});

type Profile = { id: string; name: string; email: string };

function SellerDetailsPage() {
  const { userId } = Route.useParams();
  const { range } = Route.useSearch();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isManager, setIsManager] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Pick<Message, "id" | "conversation_id" | "direction" | "created_at" | "sender_id">[]>([]);
  const [others, setOthers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<string>("");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<ConvLabel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ConvStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const sinceIso = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [p, r, c, m, others] = await Promise.all([
      supabase.from("profiles").select("id,name,email").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("conversations").select("*").eq("assigned_to", userId)
        .order("last_message_at", { ascending: false }),
      supabase.from("messages")
        .select("id,conversation_id,direction,created_at,sender_id")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true })
        .limit(5000),
      supabase.from("profiles").select("id,name,email").neq("id", userId).order("name"),
    ]);
    setProfile((p.data ?? null) as Profile | null);
    setIsManager(((r.data ?? []) as { role: string }[]).some((x) => x.role === "gestor"));
    setConversations((c.data ?? []) as Conversation[]);
    setMessages(m.data ?? []);
    setOthers((others.data ?? []) as Profile[]);
    setLoading(false);
  }, [userId]);

  async function transfer(convId: string, toUserId: string | null) {
    setTransferring(convId);
    const { error } = await supabase
      .from("conversations")
      .update({ assigned_to: toUserId })
      .eq("id", convId);
    setTransferring(null);
    if (error) return toast.error(error.message);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    setSelected((prev) => { const n = new Set(prev); n.delete(convId); return n; });
    toast.success(toUserId ? "Conversa transferida" : "Conversa sem responsável");
  }

  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  }
  function toggleAll(on: boolean, ids: string[]) {
    setSelected(on ? new Set(ids) : new Set());
  }

  async function bulkTransfer() {
    if (selected.size === 0 || !bulkTarget) return;
    const ids = Array.from(selected);
    const toUserId = bulkTarget === "__none" ? null : bulkTarget;
    setBulkRunning(true);
    const { error } = await supabase
      .from("conversations")
      .update({ assigned_to: toUserId })
      .in("id", ids);
    setBulkRunning(false);
    if (error) return toast.error(error.message);
    setConversations((prev) => prev.filter((c) => !selected.has(c.id)));
    setSelected(new Set());
    setBulkTarget("");
    toast.success(`${ids.length} conversa(s) transferida(s)`);
  }

  useEffect(() => { void load(); }, [load]);

  const days = RANGE_DAYS[range as RangeKey];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (labelFilter !== "all" && c.label !== labelFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q && !(c.contact_name.toLowerCase().includes(q) || (c.contact_phone ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [conversations, search, labelFilter, statusFilter]);

  const metrics = useMemo(() => {
    const since = Date.now() - days * 86400_000;
    const convIds = new Set(conversations.map((c) => c.id));
    const periodMsgs = messages.filter(
      (m) => convIds.has(m.conversation_id) && new Date(m.created_at).getTime() >= since,
    );
    const periodConvs = conversations.filter(
      (c) => new Date(c.last_message_at).getTime() >= since,
    );

    // First-response time per conversation in period
    const byConv = new Map<string, typeof messages>();
    for (const msg of periodMsgs) {
      const arr = byConv.get(msg.conversation_id) ?? [];
      arr.push(msg);
      byConv.set(msg.conversation_id, arr);
    }
    const responseTimes: number[] = [];
    for (const arr of byConv.values()) {
      const firstIn = arr.find((m) => m.direction === "inbound");
      if (!firstIn) continue;
      const firstOut = arr.find(
        (m) => m.direction === "outbound" &&
          new Date(m.created_at).getTime() > new Date(firstIn.created_at).getTime() &&
          m.sender_id === userId,
      );
      if (!firstOut) continue;
      const diff = (new Date(firstOut.created_at).getTime() - new Date(firstIn.created_at).getTime()) / 60000;
      if (diff >= 0 && diff < 60 * 24 * 7) responseTimes.push(diff);
    }
    const avgResp = responseTimes.length
      ? Math.round(responseTimes.reduce((s, n) => s + n, 0) / responseTimes.length)
      : 0;

    const closed = periodConvs.filter((c) => c.label === "closed" || c.status === "encerrada").length;
    const conversion = periodConvs.length ? Math.round((closed / periodConvs.length) * 100) : 0;
    const sent = periodMsgs.filter((m) => m.direction === "outbound" && m.sender_id === userId).length;
    const received = periodMsgs.filter((m) => m.direction === "inbound").length;

    // Daily series
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const series: { date: string; recebidas: number; enviadas: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const dayMsgs = periodMsgs.filter((m) => {
        const t = new Date(m.created_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      series.push({
        date: key,
        recebidas: dayMsgs.filter((m) => m.direction === "inbound").length,
        enviadas: dayMsgs.filter((m) => m.direction === "outbound" && m.sender_id === userId).length,
      });
    }

    return {
      avgResp, conversion, closed, sent, received, series,
      periodConvs, periodConvCount: periodConvs.length,
    };
  }, [conversations, messages, days, userId]);

  if (role !== "gestor") {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Acesso restrito</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apenas gestores podem ver os detalhes de vendedores.
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

  if (!profile) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <Card className="max-w-md text-center">
          <CardHeader><CardTitle>Vendedor não encontrado</CardTitle></CardHeader>
          <CardContent>
            <Link to="/dashboard"><Button variant="outline" size="sm">Voltar ao dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAll = conversations.length;
  const open = conversations.filter((c) => c.status !== "encerrada").length;
  const hot = conversations.filter((c) => c.label === "hot").length;
  const closedAll = conversations.filter((c) => c.label === "closed" || c.status === "encerrada").length;
  const unread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-6 py-4 border-b bg-card flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon" title="Voltar"><ArrowLeft className="size-4" /></Button>
          </Link>
          <Avatar className="size-11">
            <AvatarFallback className="bg-secondary">{initials(profile.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold truncate">{profile.name}</h1>
              <Badge variant={isManager ? "default" : "secondary"} className="capitalize">
                {isManager ? "gestor" : "vendedor"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
          </div>
        </div>
        <Tabs
          value={range}
          onValueChange={(v) => navigate({ to: "/team/$userId", params: { userId }, search: { range: v as RangeKey } })}
        >
          <TabsList>
            <TabsTrigger value="7d">7 dias</TabsTrigger>
            <TabsTrigger value="14d">14 dias</TabsTrigger>
            <TabsTrigger value="30d">30 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          {/* Period KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi icon={MessageSquare} label="Conversas" value={metrics.periodConvCount} sub={`em ${range}`} />
            <Kpi icon={Timer} label="Resp. média" value={metrics.avgResp} suffix="min" />
            <Kpi icon={Target} label="Conversão" value={metrics.conversion} suffix="%" accent="primary" />
            <Kpi icon={CheckCircle2} label="Fechadas" value={metrics.closed} />
            <Kpi icon={Send} label="Enviadas" value={metrics.sent} />
            <Kpi icon={Inbox} label="Recebidas" value={metrics.received} />
          </section>

          {/* Volume chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Atividade — últimos {days} dias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.series} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="sIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="sOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-label-warm)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-label-warm)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="recebidas" stroke="hsl(var(--primary))" fill="url(#sIn)" strokeWidth={2} />
                    <Area type="monotone" dataKey="enviadas" stroke="var(--color-label-warm)" fill="url(#sOut)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Lifetime overview */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi icon={MessageSquare} label="Total" value={totalAll} />
            <Kpi icon={Clock} label="Abertas" value={open} />
            <Kpi icon={Inbox} label="Não lidas" value={unread} accent="primary" />
            <Kpi icon={Flame} label="Quentes" value={hot} accent="hot" />
            <Kpi icon={CheckCircle2} label="Fechadas" value={closedAll} />
          </section>

          {/* Conversations list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Conversas atribuídas</span>
                <Badge variant="secondary">{conversations.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selected.size > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-2 border-b bg-accent/30 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <ArrowRightLeft className="size-4 text-primary" />
                    <span className="font-medium">{selected.size} selecionada(s)</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelected(new Set())}>
                      <X className="size-3.5 mr-1" /> limpar
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={bulkTarget} onValueChange={setBulkTarget}>
                      <SelectTrigger className="h-8 w-[200px]">
                        <SelectValue placeholder="Transferir todas para..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sem responsável</SelectItem>
                        {others.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={bulkTransfer} disabled={!bulkTarget || bulkRunning}>
                      {bulkRunning ? <Loader2 className="size-4 animate-spin" /> : "Transferir"}
                    </Button>
                  </div>
                </div>
              )}
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Sem conversas atribuídas.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selected.size > 0 && selected.size === conversations.length}
                          onCheckedChange={(v) => toggleAll(v === true)}
                          aria-label="Selecionar todas"
                        />
                      </TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Não lidas</TableHead>
                      <TableHead className="text-right">Última msg</TableHead>
                      <TableHead className="text-right w-[180px]">Transferir</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversations.map((c) => (
                      <TableRow
                        key={c.id}
                        data-state={selected.has(c.id) ? "selected" : undefined}
                        className="cursor-pointer hover:bg-accent/40 data-[state=selected]:bg-accent/60"
                        onClick={() => navigate({ to: "/inbox", search: { c: c.id } as never })}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selected.has(c.id)}
                            onCheckedChange={(v) => toggleOne(c.id, v === true)}
                            aria-label="Selecionar conversa"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{c.contact_name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {c.last_message ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {LABEL_META[c.label].emoji} {LABEL_META[c.label].name}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{STATUS_LABEL[c.status]}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.unread_count > 0 ? <Badge>{c.unread_count}</Badge> : <span className="text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {formatTime(c.last_message_at)}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {transferring === c.id ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground ml-auto" />
                          ) : (
                            <Select
                              value=""
                              onValueChange={(v) => transfer(c.id, v === "__none" ? null : v)}
                            >
                              <SelectTrigger className="h-8 w-[170px]">
                                <SelectValue placeholder="Transferir para..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">Sem responsável</SelectItem>
                                {others.map((o) => (
                                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
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
