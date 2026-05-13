import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isManagerRole, type AppRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, X, Users, MessageSquare, Inbox, Flame } from "lucide-react";
import {
  initials, formatTime, LABEL_META, STATUS_LABEL,
  type Conversation, type ConvLabel, type ConvStatus,
} from "@/lib/inbox-types";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
});

type Profile = { id: string; name: string };

type ContactRow = {
  phone: string;
  name: string;
  conversations: number;
  unread: number;
  lastMessage: string | null;
  lastAt: string;
  label: Conversation["label"];
  status: Conversation["status"];
  assignedTo: string | null;
  latestConvId: string;
};

function ContactsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<ConvLabel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ConvStatus | "all">("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [c, p] = await Promise.all([
        supabase.from("conversations").select("*").order("last_message_at", { ascending: false }),
        supabase.from("profiles").select("id,name").order("name"),
      ]);
      if (cancelled) return;
      setConvs((c.data ?? []) as Conversation[]);
      setProfiles((p.data ?? []) as Profile[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.name])),
    [profiles],
  );

  const contacts = useMemo<ContactRow[]>(() => {
    const map = new Map<string, ContactRow>();
    // convs are already sorted desc by last_message_at, so first hit per phone is latest
    for (const c of convs) {
      const key = c.contact_phone;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          phone: key,
          name: c.contact_name,
          conversations: 1,
          unread: c.unread_count,
          lastMessage: c.last_message,
          lastAt: c.last_message_at,
          label: c.label,
          status: c.status,
          assignedTo: c.assigned_to,
          latestConvId: c.id,
        });
      } else {
        existing.conversations += 1;
        existing.unread += c.unread_count;
      }
    }
    return Array.from(map.values());
  }, [convs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (labelFilter !== "all" && c.label !== labelFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (assignedFilter !== "all") {
        if (assignedFilter === "__none" && c.assignedTo !== null) return false;
        if (assignedFilter !== "__none" && c.assignedTo !== assignedFilter) return false;
      }
      if (q) {
        const hay = `${c.name} ${c.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contacts, search, labelFilter, statusFilter, assignedFilter]);

  const stats = useMemo(() => ({
    total: contacts.length,
    unread: contacts.reduce((s, c) => s + c.unread, 0),
    hot: contacts.filter((c) => c.label === "hot").length,
    multi: contacts.filter((c) => c.conversations > 1).length,
  }), [contacts]);

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasFilter = search || labelFilter !== "all" || statusFilter !== "all" || assignedFilter !== "all";

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="size-5 text-primary" /> Contatos
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Diretório agregado de todos os contatos do workspace.
        </p>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={Users} label="Contatos" value={stats.total} />
            <Stat icon={Inbox} label="Não lidas" value={stats.unread} accent="primary" />
            <Stat icon={Flame} label="Quentes" value={stats.hot} accent="hot" />
            <Stat icon={MessageSquare} label="Recorrentes" value={stats.multi} sub="2+ conversas" />
          </section>

          <Card>
            <CardHeader className="pb-3 space-y-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Diretório</span>
                <Badge variant="secondary">
                  {filtered.length}
                  {filtered.length !== contacts.length && ` / ${contacts.length}`}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar nome ou telefone..."
                    className="h-8 pl-8"
                  />
                </div>
                <Select value={labelFilter} onValueChange={(v) => setLabelFilter(v as ConvLabel | "all")}>
                  <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas etiquetas</SelectItem>
                    {(Object.keys(LABEL_META) as ConvLabel[]).map((k) => (
                      <SelectItem key={k} value={k}>{LABEL_META[k].emoji} {LABEL_META[k].name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ConvStatus | "all")}>
                  <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    {(Object.keys(STATUS_LABEL) as ConvStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isManagerRole(role) && (
                  <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                    <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos vendedores</SelectItem>
                      <SelectItem value="__none">Sem responsável</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {hasFilter && (
                  <Button
                    variant="ghost" size="sm" className="h-8 px-2"
                    onClick={() => {
                      setSearch(""); setLabelFilter("all");
                      setStatusFilter("all"); setAssignedFilter("all");
                    }}
                  >
                    <X className="size-3.5 mr-1" /> limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {contacts.length === 0 ? "Nenhum contato ainda." : "Nenhum contato corresponde aos filtros."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contato</TableHead>
                      <TableHead>Etiqueta</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead className="text-right">Conversas</TableHead>
                      <TableHead className="text-right">Não lidas</TableHead>
                      <TableHead className="text-right">Última msg</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow
                        key={c.phone}
                        className="cursor-pointer hover:bg-accent/40"
                        onClick={() => navigate({ to: "/contacts/$phone", params: { phone: encodeURIComponent(c.phone) } })}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="size-8">
                              <AvatarFallback className="bg-secondary text-xs">{initials(c.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{c.name}</div>
                              <div className="text-xs text-muted-foreground tabular-nums">{c.phone}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{LABEL_META[c.label].emoji} {LABEL_META[c.label].name}</span>
                        </TableCell>
                        <TableCell className="text-xs">{STATUS_LABEL[c.status]}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.assignedTo ? (profileMap.get(c.assignedTo) ?? "—") : <span className="italic">sem responsável</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{c.conversations}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.unread > 0 ? <Badge>{c.unread}</Badge> : <span className="text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {formatTime(c.lastAt)}
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

function Stat({
  icon: Icon, label, value, accent, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: "primary" | "hot";
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
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{sub}</div>}
      </CardContent>
    </Card>
  );
}
