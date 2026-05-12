import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Workflow, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { LABEL_META, STATUS_LABEL, type ConvLabel, type ConvStatus } from "@/lib/inbox-types";

type Trigger = Database["public"]["Enums"]["automation_trigger"];
type Action = Database["public"]["Enums"]["automation_action"];

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  trigger_config: Record<string, unknown>;
  action: Action;
  action_config: Record<string, unknown>;
};

type Profile = { id: string; name: string };
type Template = { id: string; title: string };

export const Route = createFileRoute("/_authenticated/automations")({
  component: AutomationsPage,
});

const TRIGGER_LABEL: Record<Trigger, string> = {
  no_reply: "Sem resposta há X minutos",
  keyword_inbound: "Mensagem recebida contém palavra-chave",
  new_conversation: "Nova conversa criada",
};
const ACTION_LABEL: Record<Action, string> = {
  transfer: "Transferir para vendedor",
  set_label: "Aplicar etiqueta",
  set_status: "Alterar status",
  send_template: "Enviar template",
};

function AutomationsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (role && role !== "gestor") navigate({ to: "/inbox" });
  }, [role, navigate]);

  async function load() {
    const [r, p, t] = await Promise.all([
      supabase.from("automation_rules").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,name").order("name"),
      supabase.from("message_templates").select("id,title").order("title"),
    ]);
    setRules((r.data ?? []) as Rule[]);
    setProfiles((p.data ?? []) as Profile[]);
    setTemplates((t.data ?? []) as Template[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(r: Rule) {
    const { error } = await supabase.from("automation_rules")
      .update({ enabled: !r.enabled }).eq("id", r.id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function remove(r: Rule) {
    if (!confirm(`Remover regra "${r.name}"?`)) return;
    const { error } = await supabase.from("automation_rules").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Regra removida"); void load(); }
  }

  function describeRule(r: Rule): string {
    const t = r.trigger_config;
    const a = r.action_config;
    let trig = TRIGGER_LABEL[r.trigger];
    if (r.trigger === "no_reply") trig = `Sem resposta há ${t.minutes ?? "?"} min`;
    if (r.trigger === "keyword_inbound") trig = `Mensagem contém "${t.keyword ?? "?"}"`;

    let act = ACTION_LABEL[r.action];
    if (r.action === "transfer") act = `Transferir para ${profiles.find((p) => p.id === a.user_id)?.name ?? "?"}`;
    if (r.action === "set_label") act = `Etiquetar como ${LABEL_META[a.label as ConvLabel]?.name ?? a.label}`;
    if (r.action === "set_status") act = `Status → ${STATUS_LABEL[a.status as ConvStatus] ?? a.status}`;
    if (r.action === "send_template") act = `Enviar "${templates.find((t2) => t2.id === a.template_id)?.title ?? "?"}"`;
    return `${trig} → ${act}`;
  }

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-6 py-4 border-b bg-card flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Workflow className="size-5 text-primary" /> Automações
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Defina regras para reagir automaticamente a eventos do inbox.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="size-4 mr-1" /> Nova regra
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-5xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Regras configuradas ({rules.length})</CardTitle>
              <CardDescription>
                As ações são executadas pelo backend assim que os eventos correspondentes ocorrerem.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rules.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma regra criada. Clique em "Nova regra" para começar.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Regra</TableHead>
                      <TableHead>Ativa</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{describeRule(r)}</TableCell>
                        <TableCell>
                          <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
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

      <RuleDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        profiles={profiles}
        templates={templates}
        userId={user?.id ?? null}
        onSaved={() => { setOpen(false); void load(); }}
      />
    </div>
  );
}

function RuleDialog({
  open, onOpenChange, editing, profiles, templates, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Rule | null;
  profiles: Profile[];
  templates: Template[];
  userId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<Trigger>("no_reply");
  const [tConfig, setTConfig] = useState<Record<string, unknown>>({ minutes: 30 });
  const [action, setAction] = useState<Action>("transfer");
  const [aConfig, setAConfig] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setTrigger(editing.trigger);
      setTConfig(editing.trigger_config ?? {});
      setAction(editing.action);
      setAConfig(editing.action_config ?? {});
    } else {
      setName(""); setTrigger("no_reply"); setTConfig({ minutes: 30 });
      setAction("transfer"); setAConfig({});
    }
  }, [editing, open]);

  async function save() {
    if (!name.trim()) return toast.error("Dê um nome à regra");
    setSaving(true);
    const payload = {
      name: name.trim(),
      trigger,
      trigger_config: tConfig,
      action,
      action_config: aConfig,
    };
    const res = editing
      ? await supabase.from("automation_rules").update(payload).eq("id", editing.id)
      : await supabase.from("automation_rules").insert({ ...payload, created_by: userId });
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Regra atualizada" : "Regra criada");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><span /></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar regra" : "Nova regra"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Auto-transferir leads frios" />
          </div>

          <div className="space-y-1.5">
            <Label>Quando</Label>
            <Select value={trigger} onValueChange={(v) => { setTrigger(v as Trigger); setTConfig(v === "no_reply" ? { minutes: 30 } : v === "keyword_inbound" ? { keyword: "" } : {}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TRIGGER_LABEL) as Trigger[]).map((k) => (
                  <SelectItem key={k} value={k}>{TRIGGER_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {trigger === "no_reply" && (
              <Input type="number" min={1} placeholder="Minutos"
                value={(tConfig.minutes as number) ?? 30}
                onChange={(e) => setTConfig({ minutes: Number(e.target.value) || 0 })} />
            )}
            {trigger === "keyword_inbound" && (
              <Input placeholder="palavra-chave"
                value={(tConfig.keyword as string) ?? ""}
                onChange={(e) => setTConfig({ keyword: e.target.value })} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Então</Label>
            <Select value={action} onValueChange={(v) => { setAction(v as Action); setAConfig({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_LABEL) as Action[]).map((k) => (
                  <SelectItem key={k} value={k}>{ACTION_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {action === "transfer" && (
              <Select value={(aConfig.user_id as string) ?? ""} onValueChange={(v) => setAConfig({ user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {action === "set_label" && (
              <Select value={(aConfig.label as string) ?? ""} onValueChange={(v) => setAConfig({ label: v })}>
                <SelectTrigger><SelectValue placeholder="Etiqueta" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_META) as ConvLabel[]).map((k) => (
                    <SelectItem key={k} value={k}>{LABEL_META[k].emoji} {LABEL_META[k].name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {action === "set_status" && (
              <Select value={(aConfig.status as string) ?? ""} onValueChange={(v) => setAConfig({ status: v })}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as ConvStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {action === "send_template" && (
              <Select value={(aConfig.template_id as string) ?? ""} onValueChange={(v) => setAConfig({ template_id: v })}>
                <SelectTrigger><SelectValue placeholder="Template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <Badge variant="secondary" className="text-xs">
            Persistência apenas — execução automática será adicionada por edge function.
          </Badge>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
