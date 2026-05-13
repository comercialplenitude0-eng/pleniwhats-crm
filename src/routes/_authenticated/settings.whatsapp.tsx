import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import {
  getWhatsappSettings,
  saveWhatsappSettings,
  testWhatsappConnection,
} from "@/lib/whatsapp-settings.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, Save, PlugZap, ArrowLeft, CheckCircle2, XCircle, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings/whatsapp")({
  component: WhatsappSettingsPage,
});

type Form = {
  access_token: string;
  phone_number_id: string;
  verify_token: string;
  app_secret: string;
  business_account_id: string;
};

function WhatsappSettingsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const fetchSettings = useServerFn(getWhatsappSettings);
  const saveFn = useServerFn(saveWhatsappSettings);
  const testFn = useServerFn(testWhatsappConnection);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [meta, setMeta] = useState<{
    hasAccessToken: boolean;
    hasAppSecret: boolean;
    accessTokenPreview: string | null;
    appSecretPreview: string | null;
    updated_at: string | null;
  } | null>(null);
  const [form, setForm] = useState<Form>({
    access_token: "",
    phone_number_id: "",
    verify_token: "",
    app_secret: "",
    business_account_id: "",
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; phone?: string | null; verifiedName?: string | null } | null>(null);

  useEffect(() => {
    if (role && role !== "gestor") navigate({ to: "/inbox" });
  }, [role, navigate]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await fetchSettings();
        setMeta(data);
        setForm((f) => ({
          ...f,
          phone_number_id: data.phone_number_id,
          verify_token: data.verify_token,
          business_account_id: data.business_account_id,
        }));
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
     
  }, []);

  function update<K extends keyof Form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function validate(): string | null {
    if (!/^\d{6,25}$/.test(form.phone_number_id)) return "Phone Number ID inválido (apenas dígitos).";
    if (form.verify_token.trim().length < 8) return "Verify token muito curto (mínimo 8).";
    if (form.access_token && form.access_token.length < 20) return "Access token parece inválido.";
    if (form.app_secret && form.app_secret.length < 20) return "App secret parece inválido.";
    if (!meta?.hasAccessToken && !form.access_token) return "Informe o Access Token.";
    return null;
  }

  async function onSave() {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      await saveFn({
        data: {
          access_token: form.access_token || null,
          phone_number_id: form.phone_number_id,
          verify_token: form.verify_token,
          app_secret: form.app_secret || null,
          business_account_id: form.business_account_id || null,
        },
      });
      toast.success("Credenciais salvas");
      const data = await fetchSettings();
      setMeta(data);
      setForm((f) => ({ ...f, access_token: "", app_secret: "" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testFn({ data: undefined });
      setTestResult(r);
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/hooks/whatsapp`
      : "/api/public/hooks/whatsapp";

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-6 py-4 border-b bg-card flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings"><ArrowLeft className="size-4" /></Link>
        </Button>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <MessageCircle className="size-5 text-primary" /> WhatsApp Cloud API (Meta)
        </h1>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6 max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Webhook</CardTitle>
              <CardDescription>
                Use esta URL no painel da Meta (Webhooks → WhatsApp → Callback URL) e cole o
                Verify token abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    toast.success("URL copiada");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Credenciais</CardTitle>
              <CardDescription>
                Os campos sensíveis (Access token e App secret) ficam ocultos após salvar.
                Deixe em branco para manter o valor atual.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Access Token</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={meta?.hasAccessToken ? `Atual: ${meta.accessTokenPreview}` : "EAAG..."}
                  value={form.access_token}
                  onChange={(e) => update("access_token", e.target.value)}
                />
                {meta?.hasAccessToken && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="size-3" /> Configurado
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Phone Number ID</Label>
                  <Input
                    placeholder="1234567890"
                    value={form.phone_number_id}
                    onChange={(e) => update("phone_number_id", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Business Account ID (opcional)</Label>
                  <Input
                    placeholder="0987654321"
                    value={form.business_account_id}
                    onChange={(e) => update("business_account_id", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Verify Token (Webhook)</Label>
                <Input
                  placeholder="qualquer string secreta para o handshake"
                  value={form.verify_token}
                  onChange={(e) => update("verify_token", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>App Secret</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={meta?.hasAppSecret ? `Atual: ${meta.appSecretPreview}` : "App secret do app Meta"}
                  value={form.app_secret}
                  onChange={(e) => update("app_secret", e.target.value)}
                />
                {meta?.hasAppSecret && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="size-3" /> Configurado
                  </Badge>
                )}
              </div>

              {meta?.updated_at && (
                <p className="text-xs text-muted-foreground">
                  Última atualização: {new Date(meta.updated_at).toLocaleString("pt-BR")}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onTest} disabled={testing}>
              {testing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <PlugZap className="size-4 mr-2" />}
              Testar conexão
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              Salvar
            </Button>
          </div>

          {testResult && (
            <Card className={testResult.ok ? "border-emerald-500/40" : "border-destructive/40"}>
              <CardContent className="pt-4 flex items-start gap-3">
                {testResult.ok ? (
                  <CheckCircle2 className="size-5 text-emerald-500 mt-0.5" />
                ) : (
                  <XCircle className="size-5 text-destructive mt-0.5" />
                )}
                <div className="text-sm">
                  <p className="font-medium">{testResult.message}</p>
                  {testResult.ok && (testResult.phone || testResult.verifiedName) && (
                    <p className="text-muted-foreground mt-1">
                      {testResult.verifiedName} · {testResult.phone}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
