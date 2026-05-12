import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Loader2, MessageSquare, Phone, Inbox, Flame,
  Activity, StickyNote, ExternalLink,
} from "lucide-react";
import {
  initials, formatTime, LABEL_META, STATUS_LABEL,
  type Conversation,
} from "@/lib/inbox-types";

export const Route = createFileRoute("/_authenticated/contacts/$phone")({
  component: ContactDetailsPage,
});

type Profile = { id: string; name: string };
type Activity = {
  id: string;
  conversation_id: string;
  user_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};
type Note = {
  id: string;
  conversation_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

function ContactDetailsPage() {
  const { phone: phoneParam } = Route.useParams();
  const phone = decodeURIComponent(phoneParam);
  const navigate = useNavigate();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const c = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_phone", phone)
        .order("last_message_at", { ascending: false });
      if (cancelled) return;
      const conversations = (c.data ?? []) as Conversation[];
      setConvs(conversations);
      const ids = conversations.map((x) => x.id);
      const [p, a, n] = await Promise.all([
        supabase.from("profiles").select("id,name").order("name"),
        ids.length
          ? supabase.from("conversation_activity").select("*").in("conversation_id", ids).order("created_at", { ascending: false }).limit(50)
          : Promise.resolve({ data: [] as Activity[] }),
        ids.length
          ? supabase.from("conversation_notes").select("*").in("conversation_id", ids).order("created_at", { ascending: false }).limit(50)
          : Promise.resolve({ data: [] as Note[] }),
      ]);
      if (cancelled) return;
      setProfiles((p.data ?? []) as Profile[]);
      setActivities((a.data ?? []) as Activity[]);
      setNotes((n.data ?? []) as Note[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [phone]);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p.name])), [profiles]);

  const summary = useMemo(() => {
    const total = convs.length;
    const unread = convs.reduce((s, c) => s + c.unread_count, 0);
    const open = convs.filter((c) => c.status !== "encerrada").length;
    const hot = convs.filter((c) => c.label === "hot").length;
    const name = convs[0]?.contact_name ?? phone;
    const lastAt = convs[0]?.last_message_at ?? null;
    return { total, unread, open, hot, name, lastAt };
  }, [convs, phone]);

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (convs.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-center">
        <div>
          <p className="text-muted-foreground mb-4">Contato não encontrado.</p>
          <Button asChild variant="outline"><Link to="/contacts">Voltar</Link></Button>
        </div>
      </div>
    );
  }

  function describeActivity(a: Activity): string {
    const actor = a.user_id ? (profileMap.get(a.user_id) ?? "alguém") : "sistema";
    const p = a.payload;
    const targetName = (key: string) => {
      const v = p[key];
      if (typeof v === "string") return profileMap.get(v) ?? "—";
      return "—";
    };
    switch (a.kind) {
      case "transfer":
        return `${actor} transferiu de ${p.from_name ?? targetName("from_user_id") ?? "—"} para ${p.to_name ?? targetName("to_user_id") ?? "—"}`;
      case "label_changed":
        return `${actor} mudou etiqueta de ${LABEL_META[p.from as keyof typeof LABEL_META]?.name ?? p.from} para ${LABEL_META[p.to as keyof typeof LABEL_META]?.name ?? p.to}`;
      case "status_changed":
        return `${actor} mudou status para ${STATUS_LABEL[p.to as keyof typeof STATUS_LABEL] ?? p.to}`;
      case "assigned_changed":
        return `${actor} reatribuiu a ${p.to ? (profileMap.get(p.to as string) ?? "—") : "ninguém"}`;
      case "note_created":
        return `${actor} adicionou nota: "${p.preview ?? ""}"`;
      default:
        return `${actor} — ${a.kind}`;
    }
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-6 py-4 border-b bg-card flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/contacts" })}>
          <ArrowLeft className="size-4" />
        </Button>
        <Avatar className="size-10">
          <AvatarFallback className="bg-secondary">{initials(summary.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">{summary.name}</h1>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Phone className="size-3" /> <span className="tabular-nums">{phone}</span>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={MessageSquare} label="Conversas" value={summary.total} />
            <Stat icon={Inbox} label="Não lidas" value={summary.unread} accent="primary" />
            <Stat icon={Activity} label="Abertas" value={summary.open} />
            <Stat icon={Flame} label="Quentes" value={summary.hot} accent="hot" />
          </section>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Conversas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etiqueta</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Não lidas</TableHead>
                    <TableHead className="text-right">Última msg</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convs.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => navigate({ to: "/inbox", search: { c: c.id } as never })}
                    >
                      <TableCell className="text-xs">
                        {LABEL_META[c.label].emoji} {LABEL_META[c.label].name}
                      </TableCell>
                      <TableCell className="text-xs">{STATUS_LABEL[c.status]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.assigned_to ? (profileMap.get(c.assigned_to) ?? "—") : <span className="italic">sem responsável</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.unread_count > 0 ? <Badge>{c.unread_count}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {formatTime(c.last_message_at)}
                      </TableCell>
                      <TableCell><ExternalLink className="size-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="size-4" /> Linha do tempo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem atividade registrada.</p>
                ) : (
                  <ul className="space-y-3">
                    {activities.map((a) => (
                      <li key={a.id} className="text-sm border-l-2 border-border pl-3">
                        <div>{describeActivity(a)}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{formatTime(a.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <StickyNote className="size-4" /> Notas internas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma nota.</p>
                ) : (
                  <ul className="space-y-3">
                    {notes.map((n) => (
                      <li key={n.id} className="text-sm rounded-md border p-3 bg-muted/30">
                        <div className="whitespace-pre-wrap">{n.body}</div>
                        <div className="text-xs text-muted-foreground mt-1.5 tabular-nums">
                          {profileMap.get(n.user_id) ?? "—"} · {formatTime(n.created_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, accent,
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
