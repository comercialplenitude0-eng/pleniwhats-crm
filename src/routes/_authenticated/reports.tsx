import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileSpreadsheet, Loader2, MessageSquare, Users, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { LABEL_META, STATUS_LABEL } from "@/lib/inbox-types";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type RangeKey = "7d" | "30d" | "90d";
const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

type ConvRow = {
  id: string;
  contact_name: string;
  contact_phone: string;
  status: string;
  label: string;
  assigned_to: string | null;
  unread_count: number;
  last_message_at: string;
  created_at: string;
};
type MsgRow = {
  id: string; conversation_id: string; direction: "inbound" | "outbound";
  type: string; created_at: string; sender_id: string | null;
};
type Profile = { id: string; name: string; email: string };

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { role } = useAuth();
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (role !== "gestor") return;
    (async () => {
      setLoading(true);
      const sinceIso = new Date(Date.now() - RANGE_DAYS[range] * 86400_000).toISOString();
      const [c, m, p] = await Promise.all([
        supabase.from("conversations").select("id,contact_name,contact_phone,status,label,assigned_to,unread_count,last_message_at,created_at").gte("last_message_at", sinceIso).order("last_message_at", { ascending: false }),
        supabase.from("messages").select("id,conversation_id,direction,type,created_at,sender_id").gte("created_at", sinceIso),
        supabase.from("profiles").select("id,name,email"),
      ]);
      if (c.error) toast.error(c.error.message);
      if (m.error) toast.error(m.error.message);
      setConversations((c.data ?? []) as ConvRow[]);
      setMessages((m.data ?? []) as MsgRow[]);
      setProfiles((p.data ?? []) as Profile[]);
      setLoading(false);
    })();
  }, [range, role]);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const stats = useMemo(() => {
    const inbound = messages.filter((m) => m.direction === "inbound").length;
    const outbound = messages.filter((m) => m.direction === "outbound").length;
    const closed = conversations.filter((c) => c.status === "fechado").length;
    const newConvs = conversations.length;
    return { inbound, outbound, closed, newConvs, total: messages.length };
  }, [messages, conversations]);

  const perSeller = useMemo(() => {
    const map = new Map<string, { name: string; sent: number; convs: number; closed: number }>();
    for (const c of conversations) {
      if (!c.assigned_to) continue;
      const p = profileMap.get(c.assigned_to);
      const cur = map.get(c.assigned_to) ?? { name: p?.name ?? "—", sent: 0, convs: 0, closed: 0 };
      cur.convs += 1;
      if (c.status === "fechado") cur.closed += 1;
      map.set(c.assigned_to, cur);
    }
    for (const m of messages) {
      if (m.direction !== "outbound" || !m.sender_id) continue;
      const p = profileMap.get(m.sender_id);
      const cur = map.get(m.sender_id) ?? { name: p?.name ?? "—", sent: 0, convs: 0, closed: 0 };
      cur.sent += 1;
      map.set(m.sender_id, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.sent - a.sent);
  }, [conversations, messages, profileMap]);

  if (role !== "gestor") return <Navigate to="/inbox" />;

  function exportConversations() {
    const rows = conversations.map((c) => ({
      id: c.id,
      contato: c.contact_name,
      telefone: c.contact_phone,
      status: STATUS_LABEL[c.status as keyof typeof STATUS_LABEL] ?? c.status,
      etiqueta: LABEL_META[c.label as keyof typeof LABEL_META]?.label ?? c.label,
      responsavel: c.assigned_to ? profileMap.get(c.assigned_to)?.name ?? "" : "",
      nao_lidas: c.unread_count,
      ultima_mensagem: c.last_message_at,
      criada_em: c.created_at,
    }));
    download(`conversas_${range}_${Date.now()}.csv`, toCSV(rows));
  }

  function exportMessages() {
    const rows = messages.map((m) => ({
      id: m.id,
      conversa: m.conversation_id,
      direcao: m.direction,
      tipo: m.type,
      remetente: m.sender_id ? profileMap.get(m.sender_id)?.name ?? "" : "",
      criada_em: m.created_at,
    }));
    download(`mensagens_${range}_${Date.now()}.csv`, toCSV(rows));
  }

  function exportSellers() {
    const rows = perSeller.map((s) => ({
      vendedor: s.name,
      conversas_atribuidas: s.convs,
      mensagens_enviadas: s.sent,
      conversas_fechadas: s.closed,
      taxa_fechamento: s.convs ? `${Math.round((s.closed / s.convs) * 100)}%` : "0%",
    }));
    download(`vendedores_${range}_${Date.now()}.csv`, toCSV(rows));
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Exporte e analise os dados do atendimento.</p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <KPI icon={MessageSquare} label="Mensagens" value={stats.total} hint={`${stats.inbound} in / ${stats.outbound} out`} />
            <KPI icon={Users} label="Conversas no período" value={stats.newConvs} />
            <KPI icon={TrendingUp} label="Fechadas" value={stats.closed} hint={stats.newConvs ? `${Math.round((stats.closed / stats.newConvs) * 100)}% taxa` : "—"} />
            <KPI icon={Clock} label="Tempo médio (estimado)" value={"—"} hint="Baseado em primeira resposta" />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">Exportações</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={exportConversations} disabled={!conversations.length}>
                <Download className="size-4" /> Conversas ({conversations.length})
              </Button>
              <Button variant="outline" onClick={exportMessages} disabled={!messages.length}>
                <Download className="size-4" /> Mensagens ({messages.length})
              </Button>
              <Button variant="outline" onClick={exportSellers} disabled={!perSeller.length}>
                <FileSpreadsheet className="size-4" /> Por vendedor ({perSeller.length})
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Desempenho por vendedor</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Conversas</TableHead>
                    <TableHead className="text-right">Mensagens enviadas</TableHead>
                    <TableHead className="text-right">Fechadas</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perSeller.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Sem dados no período</TableCell></TableRow>
                  ) : perSeller.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.convs}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.sent}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.closed}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{s.convs ? Math.round((s.closed / s.convs) * 100) : 0}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-lg bg-accent grid place-items-center text-primary"><Icon className="size-5" /></div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          {hint ? <div className="text-[11px] text-muted-foreground truncate">{hint}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
