import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAppLogs } from "@/lib/app-logs.functions";
import { useAuth, isManagerRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, FileText, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/logs")({
  component: LogsPage,
});

type Row = {
  id: string;
  level: string;
  source: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
};

const LEVEL_COLOR: Record<string, string> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  warn: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

function LogsPage() {
  const { role, loading: authLoading } = useAuth();
  const fetchLogs = useServerFn(listAppLogs);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<"all" | "debug" | "info" | "warn" | "error">("all");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");

  const allowed = isManagerRole(role);

  async function load() {
    if (!allowed) return;
    setLoading(true);
    try {
      const res = await fetchLogs({
        data: {
          level,
          source: source.trim() || undefined,
          search: search.trim() || undefined,
          limit: 200,
        },
      });
      setRows(res.rows as Row[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
     
  }, [allowed]);

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="px-4 sm:px-6 py-4 border-b bg-card">
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <FileText className="size-5 text-primary shrink-0" />
            <span className="truncate">Logs do sistema</span>
          </h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-5 text-amber-600" />
                Acesso restrito
              </CardTitle>
              <CardDescription>
                Apenas usuários com perfil <strong>Gestor</strong> ou <strong>Admin</strong> podem
                visualizar os logs do sistema. Seu perfil atual é <strong>{role ?? "—"}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/settings">
                <Button variant="outline" size="sm">Voltar para configurações</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }


  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
          <FileText className="size-5 text-primary shrink-0" />
          <span className="truncate">Logs do sistema</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Eventos dos últimos 30 dias. Apenas administradores.
        </p>
      </header>

      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Filtros</CardTitle>
            <CardDescription>Refine por nível, origem ou texto.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Select value={level} onValueChange={(v) => setLevel(v as typeof level)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os níveis</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warn">Warn</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Origem (ex: media-queue)"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <Input
                placeholder="Buscar na mensagem…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="sm:col-span-1"
              />
              <Button onClick={load} disabled={loading}>
                {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="p-0 overflow-hidden">
          <ScrollArea className="max-h-[60vh]">
            <div className="divide-y">
              {rows.length === 0 && !loading && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  Nenhum log encontrado.
                </div>
              )}
              {rows.map((r) => (
                <div key={r.id} className="p-3 sm:p-4 text-sm space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={LEVEL_COLOR[r.level] ?? ""}>
                      {r.level}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{r.source}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="text-foreground break-words">{r.message}</div>
                  {r.meta && Object.keys(r.meta).length > 0 && (
                    <pre className="text-xs text-muted-foreground bg-muted rounded p-2 mt-1 overflow-x-auto">
                      {JSON.stringify(r.meta, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
