import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isManagerRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Activity, Search, X, ExternalLink } from "lucide-react";
import { formatTime, LABEL_META, STATUS_LABEL } from "@/lib/inbox-types";

export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

type Activity = {
  id: string;
  conversation_id: string;
  user_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type Conv = { id: string; contact_name: string; contact_phone: string };
type Profile = { id: string; name: string };

const KIND_LABEL: Record<string, string> = {
  transfer: "Transferência",
  label_changed: "Etiqueta",
  status_changed: "Status",
  assigned_changed: "Atribuição",
  note_created: "Nota",
};

function AuditPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [convs, setConvs] = useState<Map<string, Conv>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");

  useEffect(() => {
    if (role && !isManagerRole(role)) navigate({ to: "/inbox" });
  }, [role, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const a = await supabase
        .from("conversation_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      const acts = (a.data ?? []) as Activity[];
      setActivities(acts);
      const convIds = Array.from(new Set(acts.map((x) => x.conversation_id)));
      const userIds = Array.from(new Set(acts.map((x) => x.user_id).filter(Boolean) as string[]));
      const [c, p] = await Promise.all([
        convIds.length
          ? supabase.from("conversations").select("id,contact_name,contact_phone").in("id", convIds)
          : Promise.resolve({ data: [] as Conv[] }),
        userIds.length
          ? supabase.from("profiles").select("id,name").in("id", userIds)
          : Promise.resolve({ data: [] as Profile[] }),
      ]);
      if (cancelled) return;
      setConvs(new Map(((c.data ?? []) as Conv[]).map((x) => [x.id, x])));
      setProfiles(new Map(((p.data ?? []) as Profile[]).map((x) => [x.id, x.name])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (actorFilter !== "all") {
        if (actorFilter === "__system" && a.user_id) return false;
        if (actorFilter !== "__system" && a.user_id !== actorFilter) return false;
      }
      if (q) {
        const conv = convs.get(a.conversation_id);
        const actor = a.user_id ? profiles.get(a.user_id) ?? "" : "sistema";
        const hay = `${conv?.contact_name ?? ""} ${conv?.contact_phone ?? ""} ${actor} ${a.kind}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activities, search, kindFilter, actorFilter, convs, profiles]);

  function describe(a: Activity): string {
    const p = a.payload;
    switch (a.kind) {
      case "transfer":
        return `de ${p.from_name ?? "—"} para ${p.to_name ?? "—"}`;
      case "label_changed":
        return `${LABEL_META[p.from as keyof typeof LABEL_META]?.name ?? p.from} → ${LABEL_META[p.to as keyof typeof LABEL_META]?.name ?? p.to}`;
      case "status_changed":
        return `${STATUS_LABEL[p.from as keyof typeof STATUS_LABEL] ?? p.from} → ${STATUS_LABEL[p.to as keyof typeof STATUS_LABEL] ?? p.to}`;
      case "assigned_changed":
        return `${p.from ? profiles.get(p.from as string) ?? "—" : "—"} → ${p.to ? profiles.get(p.to as string) ?? "—" : "ninguém"}`;
      case "note_created":
        return `"${p.preview ?? ""}"`;
      default:
        return JSON.stringify(p);
    }
  }

  const actorOptions = useMemo(() => Array.from(profiles.entries()), [profiles]);
  const hasFilter = search || kindFilter !== "all" || actorFilter !== "all";

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Activity className="size-5 text-primary" /> Auditoria
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Histórico de ações no inbox — últimas 500 atividades.
        </p>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-6xl mx-auto">
          <Card>
            <CardHeader className="pb-3 space-y-3">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>Atividades</span>
                <Badge variant="secondary">
                  {filtered.length}{filtered.length !== activities.length && ` / ${activities.length}`}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar contato, vendedor..." className="h-8 pl-8" />
                </div>
                <Select value={kindFilter} onValueChange={setKindFilter}>
                  <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos tipos</SelectItem>
                    {Object.entries(KIND_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={actorFilter} onValueChange={setActorFilter}>
                  <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos autores</SelectItem>
                    <SelectItem value="__system">Sistema</SelectItem>
                    {actorOptions.map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasFilter && (
                  <Button variant="ghost" size="sm" className="h-8 px-2"
                    onClick={() => { setSearch(""); setKindFilter("all"); setActorFilter("all"); }}>
                    <X className="size-3.5 mr-1" /> limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {activities.length === 0 ? "Nenhuma atividade registrada." : "Nada corresponde aos filtros."}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Autor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Detalhe</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((a) => {
                      const conv = convs.get(a.conversation_id);
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                            {formatTime(a.created_at)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {a.user_id ? (profiles.get(a.user_id) ?? "—") : <span className="italic text-muted-foreground">sistema</span>}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{KIND_LABEL[a.kind] ?? a.kind}</Badge></TableCell>
                          <TableCell className="text-xs">
                            {conv ? (
                              <Link to="/contacts/$phone" params={{ phone: encodeURIComponent(conv.contact_phone) }}
                                className="hover:underline">{conv.contact_name}</Link>
                            ) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{describe(a)}</TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" className="size-7"
                              onClick={() => navigate({ to: "/inbox", search: { c: a.conversation_id } as never })}>
                              <ExternalLink className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
