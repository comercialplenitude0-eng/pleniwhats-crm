import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Loader2, RefreshCw, Trash2, Save, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { listWhatsappAccounts } from "@/lib/whatsapp-accounts.functions";
import {
  listWaTemplates, submitWaTemplate, syncWaTemplates, deleteWaTemplate,
} from "@/lib/wa-templates.functions";

export const Route = createFileRoute("/_authenticated/settings_/wa-templates")({
  component: WaTemplatesPage,
});

type AccountLite = { id: string; display_name: string; phone_number: string | null; business_account_id: string | null };

type Template = {
  id: string;
  account_id: string;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  header_type: string | null;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: Array<Record<string, string>>;
  status: string;
  rejection_reason: string | null;
  meta_template_id: string | null;
  last_sync_at: string | null;
  created_at: string;
};

type ButtonDraft =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

const LANGUAGES = [
  { v: "pt_BR", label: "Português (BR)" },
  { v: "en_US", label: "English (US)" },
  { v: "es_ES", label: "Español (ES)" },
];

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  rejected: "bg-red-500/15 text-red-600 border-red-500/30",
  paused: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  disabled: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  draft: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

function WaTemplatesPage() {
  const fetchAccounts = useServerFn(listWhatsappAccounts);
  const fetchList = useServerFn(listWaTemplates);
  const submitFn = useServerFn(submitWaTemplate);
  const syncFn = useServerFn(syncWaTemplates);
  const deleteFn = useServerFn(deleteWaTemplate);

  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [accs, list] = await Promise.all([fetchAccounts(), fetchList()]);
      setAccounts(
        accs.map((a) => ({
          id: a.id,
          display_name: a.display_name,
          phone_number: a.phone_number,
          business_account_id: a.business_account_id,
        })),
      );
      setItems(list as unknown as Template[]);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function syncAll() {
    if (accounts.length === 0) return;
    setSyncing(true);
    try {
      for (const a of accounts) {
        if (a.business_account_id) {
          await syncFn({ data: { account_id: a.id } });
        }
      }
      toast.success("Status sincronizado com a Meta");
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSyncing(false);
  }

  async function remove(t: Template) {
    if (!confirm(`Excluir o template "${t.name}"? Também será removido da Meta.`)) return;
    try {
      await deleteFn({ data: { id: t.id } });
      toast.success("Template excluído");
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b bg-card flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <MessageCircle className="size-5 text-primary" />
            <span className="truncate">Templates de WhatsApp (Meta)</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Cadastre templates e envie automaticamente para aprovação da Meta.
          </p>
        </div>
        <Button variant="outline" onClick={() => void syncAll()} disabled={syncing || accounts.length === 0}>
          {syncing ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
          Sincronizar
        </Button>
        <Button onClick={() => setOpen(true)} disabled={accounts.length === 0}>
          <Plus className="size-4 mr-2" /> Novo template
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-3">
          {loading ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Cadastre uma conta WhatsApp em <Link to="/settings/whatsapp-accounts" className="text-primary underline">Contas WhatsApp</Link> primeiro.
            </Card>
          ) : items.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum template ainda. Crie o primeiro!
            </Card>
          ) : (
            items.map((t) => {
              const acc = accounts.find((a) => a.id === t.account_id);
              return (
                <Card key={t.id}>
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">{t.name}</span>
                        <Badge variant="outline" className="text-xs">{t.language}</Badge>
                        <Badge variant="outline" className="text-xs">{t.category}</Badge>
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[t.status] ?? ""}`}>
                          {t.status}
                        </Badge>
                        {acc && <span className="text-xs text-muted-foreground">· {acc.display_name}</span>}
                      </div>
                      {t.header_text && (
                        <p className="text-xs font-semibold text-muted-foreground">{t.header_text}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{t.body_text}</p>
                      {t.footer_text && (
                        <p className="text-xs text-muted-foreground italic">{t.footer_text}</p>
                      )}
                      {t.buttons?.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {t.buttons.map((b, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{b.text}</Badge>
                          ))}
                        </div>
                      )}
                      {t.rejection_reason && (
                        <p className="text-xs text-red-600">Motivo: {t.rejection_reason}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(t)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      <NewTemplateDialog
        open={open}
        onOpenChange={setOpen}
        accounts={accounts}
        onCreated={() => { setOpen(false); void load(); }}
        submitFn={submitFn}
      />
    </div>
  );
}

function NewTemplateDialog({
  open, onOpenChange, accounts, onCreated, submitFn,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accounts: AccountLite[];
  onCreated: () => void;
  submitFn: ReturnType<typeof useServerFn<typeof submitWaTemplate>>;
}) {
  const [accountId, setAccountId] = useState<string>("");
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("pt_BR");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT">("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerExample, setHeaderExample] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && accounts.length > 0 && !accountId) setAccountId(accounts[0].id);
  }, [open, accounts, accountId]);

  const bodyVarsCount = useMemo(
    () => Array.from(bodyText.matchAll(/\{\{(\d+)\}\}/g)).length,
    [bodyText],
  );

  useEffect(() => {
    setBodyExamples((prev) => {
      const next = [...prev];
      while (next.length < bodyVarsCount) next.push("");
      return next.slice(0, bodyVarsCount);
    });
  }, [bodyVarsCount]);

  function addButton(type: ButtonDraft["type"]) {
    if (buttons.length >= 3) return;
    if (type === "URL") setButtons((b) => [...b, { type, text: "", url: "https://" }]);
    else if (type === "PHONE_NUMBER") setButtons((b) => [...b, { type, text: "", phone_number: "+55" }]);
    else setButtons((b) => [...b, { type, text: "" }]);
  }

  async function save() {
    if (!accountId) return toast.error("Selecione uma conta");
    if (!name.trim()) return toast.error("Informe o nome do template");
    if (!bodyText.trim()) return toast.error("Informe o corpo do template");
    setSaving(true);
    try {
      await submitFn({
        data: {
          account_id: accountId,
          name: name.trim().toLowerCase(),
          language,
          category,
          header_type: headerType,
          header_text: headerType === "TEXT" ? headerText : null,
          body_text: bodyText,
          footer_text: footerText || null,
          buttons,
          body_examples: bodyExamples,
          header_example: headerExample || null,
        },
      });
      toast.success("Template enviado para aprovação da Meta");
      // reset
      setName(""); setHeaderText(""); setBodyText(""); setFooterText("");
      setButtons([]); setBodyExamples([]); setHeaderExample("");
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo template WhatsApp</DialogTitle>
          <CardDescription>
            Será enviado automaticamente para aprovação da Meta. A análise costuma levar alguns minutos.
          </CardDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta WhatsApp</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.v} value={l.v}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome (apenas a-z, 0-9, _)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="boas_vindas_v1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utilidade</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cabeçalho</Label>
            <Select value={headerType} onValueChange={(v) => setHeaderType(v as "NONE" | "TEXT")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Sem cabeçalho</SelectItem>
                <SelectItem value="TEXT">Texto</SelectItem>
              </SelectContent>
            </Select>
            {headerType === "TEXT" && (
              <>
                <Input
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Olá {{1}}!"
                  maxLength={60}
                />
                {/\{\{1\}\}/.test(headerText) && (
                  <Input
                    value={headerExample}
                    onChange={(e) => setHeaderExample(e.target.value)}
                    placeholder="Exemplo para {{1}}"
                  />
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Corpo (use {`{{1}}`}, {`{{2}}`} para variáveis)</Label>
            <Textarea
              rows={5}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Olá {{1}}, sua matrícula no curso {{2}} foi confirmada!"
              maxLength={1024}
            />
            {bodyVarsCount > 0 && (
              <div className="space-y-2 pt-1">
                <Label className="text-xs">Exemplos das variáveis</Label>
                {bodyExamples.map((ex, i) => (
                  <Input
                    key={i}
                    value={ex}
                    onChange={(e) => setBodyExamples((p) => p.map((v, k) => (k === i ? e.target.value : v)))}
                    placeholder={`Exemplo {{${i + 1}}}`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Rodapé (opcional)</Label>
            <Input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Equipe Pleni"
              maxLength={60}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Botões (até 3)</Label>
            <div className="space-y-2">
              {buttons.map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs mt-2">{b.type}</Badge>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Input
                      value={b.text}
                      onChange={(e) =>
                        setButtons((p) => p.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))
                      }
                      placeholder="Texto do botão"
                      maxLength={25}
                    />
                    {b.type === "URL" && (
                      <Input
                        value={b.url}
                        onChange={(e) =>
                          setButtons((p) => p.map((x, k) => (k === i && x.type === "URL" ? { ...x, url: e.target.value } : x)))
                        }
                        placeholder="https://..."
                      />
                    )}
                    {b.type === "PHONE_NUMBER" && (
                      <Input
                        value={b.phone_number}
                        onChange={(e) =>
                          setButtons((p) => p.map((x, k) => (k === i && x.type === "PHONE_NUMBER" ? { ...x, phone_number: e.target.value } : x)))
                        }
                        placeholder="+5511999999999"
                      />
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setButtons((p) => p.filter((_, k) => k !== i))}>
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => addButton("QUICK_REPLY")} disabled={buttons.length >= 3}>
                + Resposta rápida
              </Button>
              <Button size="sm" variant="outline" onClick={() => addButton("URL")} disabled={buttons.length >= 3}>
                + URL
              </Button>
              <Button size="sm" variant="outline" onClick={() => addButton("PHONE_NUMBER")} disabled={buttons.length >= 3}>
                + Telefone
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
            Enviar para Meta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
