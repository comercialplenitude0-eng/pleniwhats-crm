import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import {
  listWhatsappAccounts,
  saveWhatsappAccount,
  deleteWhatsappAccount,
  testAccountConnection,
} from "@/lib/whatsapp-accounts.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2, ArrowLeft, MessageCircle, Plus, Pencil, Trash2, PlugZap, CheckCircle2, XCircle, Copy, Phone,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/whatsapp-accounts")({
  component: WhatsappAccountsPage,
});

type Account = Awaited<ReturnType<typeof listWhatsappAccounts>>[number];

type Form = {
  id: string | null;
  display_name: string;
  phone_number: string;
  phone_number_id: string;
  business_account_id: string;
  verify_token: string;
  access_token: string;
  app_secret: string;
  enabled: boolean;
};

const emptyForm = (): Form => ({
  id: null,
  display_name: "",
  phone_number: "",
  phone_number_id: "",
  business_account_id: "",
  verify_token: "",
  access_token: "",
  app_secret: "",
  enabled: true,
});

function WhatsappAccountsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const fetchList = useServerFn(listWhatsappAccounts);
  const saveFn = useServerFn(saveWhatsappAccount);
  const deleteFn = useServerFn(deleteWhatsappAccount);
  const testFn = useServerFn(testAccountConnection);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    if (role && role !== "gestor") navigate({ to: "/inbox" });
  }, [role, navigate]);

  async function load() {
    try {
      const data = await fetchList();
      setAccounts(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
     
  }, []);

  function startCreate() {
    setForm(emptyForm());
    setOpen(true);
  }

  function startEdit(a: Account) {
    setForm({
      id: a.id,
      display_name: a.display_name,
      phone_number: a.phone_number ?? "",
      phone_number_id: a.phone_number_id,
      business_account_id: a.business_account_id ?? "",
      verify_token: a.verify_token ?? "",
      access_token: "",
      app_secret: "",
      enabled: a.enabled,
    });
    setOpen(true);
  }

  function validate(): string | null {
    if (form.display_name.trim().length < 1) return "Informe um nome para a conta.";
    if (!/^\d{6,25}$/.test(form.phone_number_id)) return "Phone Number ID inválido (apenas dígitos).";
    if (form.verify_token.trim().length < 8) return "Verify token muito curto (mínimo 8).";
    if (!form.id && form.access_token.trim().length < 20) return "Informe o Access Token.";
    if (form.access_token && form.access_token.length < 20) return "Access token parece inválido.";
    if (form.app_secret && form.app_secret.length < 20) return "App secret parece inválido.";
    return null;
  }

  async function onSave() {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      await saveFn({
        data: {
          id: form.id,
          display_name: form.display_name.trim(),
          phone_number: form.phone_number.trim() || null,
          phone_number_id: form.phone_number_id.trim(),
          business_account_id: form.business_account_id.trim() || null,
          verify_token: form.verify_token.trim(),
          access_token: form.access_token.trim() || null,
          app_secret: form.app_secret.trim() || null,
          enabled: form.enabled,
        },
      });
      toast.success(form.id ? "Conta atualizada" : "Conta criada");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(a: Account) {
    if (!confirm(`Excluir a conta "${a.display_name}"? Conversas existentes ficarão sem conta vinculada.`)) return;
    try {
      await deleteFn({ data: { id: a.id } });
      toast.success("Conta removida");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onTest(a: Account) {
    setTestingId(a.id);
    try {
      const r = await testFn({ data: { id: a.id } });
      if (r.ok) toast.success(`${r.message}${r.phone ? ` · ${r.phone}` : ""}`);
      else toast.error(r.message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingId(null);
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
      <header className="px-4 sm:px-6 py-4 border-b bg-card flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings"><ArrowLeft className="size-4" /></Link>
        </Button>
        <h1 className="text-base sm:text-xl font-semibold flex items-center gap-2 truncate">
          <MessageCircle className="size-5 text-primary shrink-0" />
          <span className="truncate">Contas WhatsApp (Meta)</span>
        </h1>
        <div className="ml-auto">
          <Button size="sm" onClick={startCreate}>
            <Plus className="size-4 mr-1" /> Nova conta
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Webhook (compartilhado)</CardTitle>
              <CardDescription>
                Use esta URL no painel da Meta de cada app. O sistema identifica a conta automaticamente
                via <code>phone_number_id</code> e valida a assinatura com o <code>app_secret</code> da conta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                <Button
                  variant="outline" size="icon"
                  onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {accounts.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="size-12 rounded-2xl bg-accent grid place-items-center mx-auto">
                  <Phone className="size-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Nenhuma conta cadastrada</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Adicione uma conta da Meta para começar a receber e enviar mensagens.
                  </p>
                </div>
                <Button onClick={startCreate}><Plus className="size-4 mr-1" /> Adicionar primeira conta</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {accounts.map((a) => (
                <Card key={a.id} className={a.enabled ? "" : "opacity-60"}>
                  <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                    <div className="size-10 rounded-xl bg-accent grid place-items-center shrink-0">
                      <Phone className="size-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{a.display_name}</span>
                        {!a.enabled && <Badge variant="secondary">Desativada</Badge>}
                        {a.hasAccessToken
                          ? <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
                              <CheckCircle2 className="size-3" /> Token
                            </Badge>
                          : <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                              <XCircle className="size-3" /> Sem token
                            </Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.phone_number ?? "—"} · ID: <span className="font-mono">{a.phone_number_id}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => onTest(a)} disabled={testingId === a.id}>
                        {testingId === a.id
                          ? <Loader2 className="size-3.5 mr-1 animate-spin" />
                          : <PlugZap className="size-3.5 mr-1" />}
                        Testar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => startEdit(a)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onDelete(a)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar conta" : "Nova conta WhatsApp"}</DialogTitle>
            <DialogDescription>
              Tokens sensíveis ficam ocultos após salvar. Deixe em branco para manter o valor atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Nome de exibição *</Label>
              <Input value={form.display_name} placeholder="Ex.: Comercial Brasil"
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Número (opcional)</Label>
                <Input value={form.phone_number} placeholder="+55 11 99999-9999"
                  onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone Number ID *</Label>
                <Input value={form.phone_number_id} placeholder="1234567890"
                  onChange={(e) => setForm((f) => ({ ...f, phone_number_id: e.target.value.replace(/\D/g, "") }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Business Account ID</Label>
              <Input value={form.business_account_id} placeholder="0987654321"
                onChange={(e) => setForm((f) => ({ ...f, business_account_id: e.target.value.replace(/\D/g, "") }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Verify Token (Webhook) *</Label>
              <Input value={form.verify_token} placeholder="string secreta para o handshake"
                onChange={(e) => setForm((f) => ({ ...f, verify_token: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Access Token {form.id ? "(deixe vazio para manter)" : "*"}</Label>
              <Input type="password" autoComplete="off" value={form.access_token} placeholder="EAAG..."
                onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>App Secret {form.id && "(deixe vazio para manter)"}</Label>
              <Input type="password" autoComplete="off" value={form.app_secret}
                placeholder="App secret do app Meta"
                onChange={(e) => setForm((f) => ({ ...f, app_secret: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label htmlFor="enabled">Conta ativa</Label>
              <Switch id="enabled" checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
