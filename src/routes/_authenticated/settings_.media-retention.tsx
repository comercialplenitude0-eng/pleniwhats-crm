import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, isManagerRole } from "@/lib/auth";
import {
  getMediaRetentionSettings,
  updateMediaRetentionSettings,
  runMediaCleanupNow,
} from "@/lib/media-retention.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Trash2, Save, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/media-retention")({
  component: MediaRetentionPage,
});

const MEDIA_OPTIONS: { value: "audio" | "video" | "image" | "document"; label: string; hint: string }[] = [
  { value: "audio", label: "Áudios", hint: "Geralmente o que mais ocupa espaço" },
  { value: "video", label: "Vídeos", hint: "Arquivos pesados" },
  { value: "image", label: "Imagens", hint: "Fotos e prints" },
  { value: "document", label: "Documentos", hint: "PDFs, planilhas, etc." },
];

function MediaRetentionPage() {
  const { roles } = useAuth();
  const isManager = isManagerRole(roles);
  const fetchSettings = useServerFn(getMediaRetentionSettings);
  const saveSettings = useServerFn(updateMediaRetentionSettings);
  const runNow = useServerFn(runMediaCleanupNow);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [months, setMonths] = useState(12);
  const [types, setTypes] = useState<string[]>(["audio", "video"]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastRunDeleted, setLastRunDeleted] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await fetchSettings();
        if (!alive || !s) return;
        setEnabled(!!s.enabled);
        setMonths(Number(s.retention_months ?? 12));
        setTypes(Array.isArray(s.media_types) ? s.media_types : ["audio", "video"]);
        setLastRunAt(s.last_run_at ?? null);
        setLastRunDeleted(Number(s.last_run_deleted_count ?? 0));
      } catch (e) {
        toast.error("Erro ao carregar configurações");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchSettings]);

  function toggleType(t: string) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function handleSave() {
    if (types.length === 0) {
      toast.error("Selecione ao menos um tipo de mídia");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        data: {
          enabled,
          retention_months: months,
          media_types: types as Array<"audio" | "video" | "image" | "document">,
        },
      });
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    if (!confirm(`Executar limpeza agora? Isso vai apagar permanentemente as mídias (${types.join(", ")}) com mais de ${months} meses.`)) {
      return;
    }
    setRunning(true);
    try {
      const result = (await runNow()) as { ok: boolean; deleted?: number; error?: string };
      if (result?.ok) {
        toast.success(`Limpeza concluída — ${result.deleted ?? 0} arquivo(s) apagados`);
        // Refresh
        const s = await fetchSettings();
        if (s) {
          setLastRunAt(s.last_run_at ?? null);
          setLastRunDeleted(Number(s.last_run_deleted_count ?? 0));
        }
      } else {
        toast.error(result?.error ?? "Erro na limpeza");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao executar");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Apenas gestores podem acessar esta página.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto py-6 px-4 space-y-4">
      <div>
        <Link to="/settings" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Voltar para configurações
        </Link>
        <h1 className="text-2xl font-semibold mt-2 flex items-center gap-2">
          <Trash2 className="size-5" /> Retenção de mídia
        </h1>
        <p className="text-sm text-muted-foreground">
          Apaga automaticamente arquivos antigos das conversas para conter o uso de armazenamento.
          O texto da conversa é preservado — apenas o arquivo de mídia é removido.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limpeza automática</CardTitle>
          <CardDescription>Roda todos os dias às 3h da manhã</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Ativar limpeza automática</Label>
              <p className="text-xs text-muted-foreground">Quando desligado, nada é apagado</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Período de retenção (meses)</Label>
            <p className="text-xs text-muted-foreground">
              Mídias mais antigas que esse período serão apagadas. Mínimo 1, máximo 60.
            </p>
            <Input
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Math.min(60, Number(e.target.value) || 12)))}
              className="w-32"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipos de mídia para apagar</Label>
            <div className="space-y-2 mt-2">
              {MEDIA_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent cursor-pointer"
                >
                  <Checkbox
                    checked={types.includes(opt.value)}
                    onCheckedChange={() => toggleType(opt.value)}
                  />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Salvar configurações
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Executar agora</CardTitle>
          <CardDescription>
            Roda a limpeza imediatamente com as configurações salvas acima
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lastRunAt && (
            <p className="text-xs text-muted-foreground">
              Última execução: {new Date(lastRunAt).toLocaleString("pt-BR")} —{" "}
              <span className="font-medium">{lastRunDeleted} arquivo(s) apagados</span>
            </p>
          )}
          <Button
            variant="outline"
            onClick={handleRunNow}
            disabled={running || !enabled}
            className="w-full"
          >
            {running ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <PlayCircle className="size-4 mr-2" />
            )}
            Limpar agora
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
