import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, Clock, Send, Image as ImageIcon } from "lucide-react";
import { getSystemHealth } from "@/lib/app-logs.functions";

type Health = {
  webhook_pending: number;
  outbound_pending: number;
  media_pending: number;
  errors_last_hour: number;
  last_webhook_at: string | null;
};

function formatRelative(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export function SystemHealthCard() {
  const fetchHealth = useServerFn(getSystemHealth);
  const [data, setData] = useState<Health | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetchHealth();
        if (active) setData(res);
      } catch {
        // silencioso — card não é crítico
      }
    }
    void load();
    const interval = setInterval(load, 60_000);
    return () => { active = false; clearInterval(interval); };
  }, [fetchHealth]);

  if (!data) return null;

  const hasIssue =
    data.errors_last_hour > 0 ||
    data.webhook_pending > 10 ||
    data.outbound_pending > 10 ||
    data.media_pending > 20;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          Saúde do sistema
          {hasIssue ? (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30 ml-auto">
              Atenção
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 ml-auto">
              OK
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Filas de processamento e erros recentes. Atualiza a cada minuto.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Metric icon={Clock} label="Webhook pendente" value={data.webhook_pending} warn={data.webhook_pending > 10} />
          <Metric icon={Send} label="Envio na fila" value={data.outbound_pending} warn={data.outbound_pending > 10} />
          <Metric icon={ImageIcon} label="Mídia p/ baixar" value={data.media_pending} warn={data.media_pending > 20} />
          <Metric icon={AlertCircle} label="Erros (1h)" value={data.errors_last_hour} warn={data.errors_last_hour > 0} />
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Último webhook</div>
            <div className="font-medium">{formatRelative(data.last_webhook_at)}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          <Link to="/settings/logs" className="underline hover:text-foreground">
            Ver logs detalhados →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon: Icon, label, value, warn,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; warn: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${warn ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="size-3" /> {label}
      </div>
      <div className={`font-semibold text-lg ${warn ? "text-amber-600" : ""}`}>{value}</div>
    </div>
  );
}
