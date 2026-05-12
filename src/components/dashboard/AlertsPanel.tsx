import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, BellRing, BellOff, Settings2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export type AlertSettings = {
  id: string;
  max_response_time_min: number;
  min_conversion_rate: number;
  max_waiting: number;
  max_unread_per_seller: number;
  enabled: boolean;
};

export type AlertContext = {
  avgResponseMin: number;
  conversionRate: number;
  waiting: number;
  sellers: { id: string; name: string; unread: number }[];
};

type AlertItem = {
  id: string;
  level: "warning" | "danger";
  title: string;
  detail: string;
};

function computeAlerts(s: AlertSettings, ctx: AlertContext): AlertItem[] {
  const out: AlertItem[] = [];
  if (ctx.avgResponseMin > s.max_response_time_min) {
    out.push({
      id: "response",
      level: ctx.avgResponseMin > s.max_response_time_min * 2 ? "danger" : "warning",
      title: "Tempo de resposta alto",
      detail: `Média de ${ctx.avgResponseMin} min (limite ${s.max_response_time_min} min)`,
    });
  }
  if (ctx.conversionRate < s.min_conversion_rate) {
    out.push({
      id: "conversion",
      level: ctx.conversionRate < s.min_conversion_rate / 2 ? "danger" : "warning",
      title: "Conversão abaixo do alvo",
      detail: `Atual ${ctx.conversionRate}% (mínimo ${s.min_conversion_rate}%)`,
    });
  }
  if (ctx.waiting > s.max_waiting) {
    out.push({
      id: "waiting",
      level: "warning",
      title: "Fila de espera grande",
      detail: `${ctx.waiting} conversas aguardando (limite ${s.max_waiting})`,
    });
  }
  for (const s2 of ctx.sellers) {
    if (s2.unread > s.max_unread_per_seller) {
      out.push({
        id: `unread-${s2.id}`,
        level: "warning",
        title: `${s2.name} com muitas não lidas`,
        detail: `${s2.unread} mensagens (limite ${s.max_unread_per_seller})`,
      });
    }
  }
  return out;
}

export function AlertsPanel({ ctx, isGestor }: { ctx: AlertContext; isGestor: boolean }) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [open, setOpen] = useState(false);
  const notifiedRef = useRef<Set<string>>(new Set());

  const load = async () => {
    const { data } = await supabase
      .from("alert_settings")
      .select("id,max_response_time_min,min_conversion_rate,max_waiting,max_unread_per_seller,enabled")
      .limit(1)
      .maybeSingle();
    if (data) setSettings(data as AlertSettings);
  };

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("alert_settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "alert_settings" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const alerts = useMemo(
    () => (settings && settings.enabled ? computeAlerts(settings, ctx) : []),
    [settings, ctx],
  );

  // Toast on new alerts
  useEffect(() => {
    if (!settings?.enabled) return;
    for (const a of alerts) {
      if (notifiedRef.current.has(a.id)) continue;
      notifiedRef.current.add(a.id);
      const fn = a.level === "danger" ? toast.error : toast.warning;
      fn(a.title, { description: a.detail });
    }
    // forget alerts that disappeared so they re-fire next time
    const current = new Set(alerts.map((a) => a.id));
    for (const id of [...notifiedRef.current]) {
      if (!current.has(id)) notifiedRef.current.delete(id);
    }
  }, [alerts, settings?.enabled]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {settings?.enabled ? (
              <BellRing className="size-4 text-amber-500" />
            ) : (
              <BellOff className="size-4 text-muted-foreground" />
            )}
            Alertas
            {alerts.length > 0 && <Badge variant="destructive">{alerts.length}</Badge>}
          </span>
          {isGestor && settings && (
            <SettingsDialog
              open={open}
              onOpenChange={setOpen}
              settings={settings}
              onSaved={(s) => setSettings(s)}
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!settings?.enabled ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <BellOff className="size-4" /> Notificações de alerta desativadas.
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" /> Tudo dentro dos limites.
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
                  a.level === "danger"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-amber-500/40 bg-amber-500/5"
                }`}
              >
                <AlertTriangle
                  className={`size-4 mt-0.5 shrink-0 ${
                    a.level === "danger" ? "text-destructive" : "text-amber-600"
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsDialog({
  open, onOpenChange, settings, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings: AlertSettings;
  onSaved: (s: AlertSettings) => void;
}) {
  const [draft, setDraft] = useState<AlertSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(settings); }, [settings]);

  async function save() {
    setSaving(true);
    const { data, error } = await supabase
      .from("alert_settings")
      .update({
        max_response_time_min: draft.max_response_time_min,
        min_conversion_rate: draft.min_conversion_rate,
        max_waiting: draft.max_waiting,
        max_unread_per_seller: draft.max_unread_per_seller,
        enabled: draft.enabled,
        updated_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      .eq("id", draft.id)
      .select("id,max_response_time_min,min_conversion_rate,max_waiting,max_unread_per_seller,enabled")
      .maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    if (data) {
      onSaved(data as AlertSettings);
      toast.success("Limites atualizados");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings2 className="size-4 mr-1" /> Limites
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar alertas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Notificações ativas</Label>
              <p className="text-xs text-muted-foreground">Mostrar alertas e disparar toasts</p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>
          <Field
            label="Tempo de resposta máximo (min)"
            value={draft.max_response_time_min}
            onChange={(v) => setDraft({ ...draft, max_response_time_min: v })}
          />
          <Field
            label="Taxa de conversão mínima (%)"
            value={draft.min_conversion_rate}
            onChange={(v) => setDraft({ ...draft, min_conversion_rate: v })}
          />
          <Field
            label="Fila máxima (aguardando)"
            value={draft.max_waiting}
            onChange={(v) => setDraft({ ...draft, max_waiting: v })}
          />
          <Field
            label="Não lidas por vendedor (máx.)"
            value={draft.max_unread_per_seller}
            onChange={(v) => setDraft({ ...draft, max_unread_per_seller: v })}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </div>
  );
}
