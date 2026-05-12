import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Megaphone, Plus, Trash2, Pencil, Send, Users, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  LABEL_META, STATUS_LABEL, formatTime,
  type ConvLabel, type ConvStatus,
} from "@/lib/inbox-types";
import type { Database } from "@/integrations/supabase/types";

type CampaignStatus = Database["public"]["Enums"]["campaign_status"];

type Campaign = {
  id: string;
  name: string;
  content: string;
  template_id: string | null;
  filter_label: ConvLabel | null;
  filter_status: ConvStatus | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  total_recipients: number;
  sent_count: number;
  created_at: string;
};

type Template = { id: string; title: string; content: string };

export const Route = createFileRoute("/_authenticated/campaigns")({
  component: CampaignsPage,
});

const STATUS_META: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Agendada", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  sending: { label: "Enviando", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  completed: { label: "Concluída", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  failed: { label: "Falhou", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

function CampaignsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (role && role !== "gestor") navigate({ to: "/inbox" });
  }, [role, navigate]);

  async function load() {
    const [c, t] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("message_templates").select("id,title,content").order("title"),
    ]);
    setCampaigns((c.data ?? []) as Campaign[]);
    setTemplates((t.data ?? []) as Template[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function remove(c: Campaign) {
    if (!confirm(`Remover campanha "${c.name}"?`)) return;
    const { error } = await supabase.from("campaigns").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("Campanha removida"); void load(); }
  }

  async function schedule(c: Campaign) {
    const { error } = await supabase.from("campaigns")
      .update({ status: "scheduled" })
      .eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("Campanha agendada"); void load(); }
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
            <Megaphone className="size-5 text-primary" /> Campanhas
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Disparos em massa para contatos filtrados.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="size-4 mr-1" /> Nova campanha
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-5xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Campanhas ({campaigns.length})</CardTitle>
              <CardDescription>
                O envio será processado por um worker em background quando agendada.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {campaigns.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma campanha. Clique em "Nova campanha".
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Filtro</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead>Criada</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => {
                      const pct = c.total_recipients > 0
                        ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{c.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">{c.content}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col gap-0.5">
                              {c.filter_label && (
                                <span>{LABEL_META[c.filter_label].emoji} {LABEL_META[c.filter_label].name}</span>
                              )}
                              {c.filter_status && <span>{STATUS_LABEL[c.filter_status]}</span>}
                              {!c.filter_label && !c.filter_status && (
                                <span className="text-muted-foreground italic">todos</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_META[c.status].className}>
                              {STATUS_META[c.status].label}
                            </Badge>
                            {c.scheduled_at && (
                              <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5 flex items-center gap-1">
                                <Calendar className="size-3" /> {formatTime(c.scheduled_at)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[120px]">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-1.5" />
                              <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                                {c.sent_count}/{c.total_recipients}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">
                            {formatTime(c.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {c.status === "draft" && (
                                <Button size="sm" variant="outline" onClick={() => schedule(c)}>
                                  <Send className="size-3.5 mr-1" /> Agendar
                                </Button>
                              )}
                              <Button size="icon" variant="ghost"
                                onClick={() => { setEditing(c); setOpen(true); }}
                                disabled={c.status !== "draft"}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => remove(c)}>
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
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

      <CampaignDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        templates={templates}
        userId={user?.id ?? null}
        onSaved={() => { setOpen(false); void load(); }}
      />
    </div>
  );
}

function CampaignDialog({
  open, onOpenChange, editing, templates, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Campaign | null;
  templates: Template[];
  userId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [labelF, setLabelF] = useState<ConvLabel | "">("");
  const [statusF, setStatusF] = useState<ConvStatus | "">("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setContent(editing.content);
      setTemplateId(editing.template_id ?? "");
      setLabelF(editing.filter_label ?? "");
      setStatusF(editing.filter_status ?? "");
      setScheduledAt(editing.scheduled_at ? editing.scheduled_at.slice(0, 16) : "");
    } else {
      setName(""); setContent(""); setTemplateId("");
      setLabelF(""); setStatusF(""); setScheduledAt("");
    }
  }, [editing, open]);

  // Estimate recipients
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      let q = supabase.from("conversations").select("contact_phone", { count: "exact", head: true });
      if (labelF) q = q.eq("label", labelF);
      if (statusF) q = q.eq("status", statusF);
      const { count } = await q;
      if (!cancelled) setEstimate(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [open, labelF, statusF]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t && !content) setContent(t.content);
  }

  async function save() {
    if (!name.trim()) return toast.error("Dê um nome à campanha");
    if (!content.trim()) return toast.error("Conteúdo obrigatório");
    setSaving(true);
    const payload = {
      name: name.trim(),
      content: content.trim(),
      template_id: templateId || null,
      filter_label: (labelF || null) as ConvLabel | null,
      filter_status: (statusF || null) as ConvStatus | null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      total_recipients: estimate ?? 0,
    };
    const res = editing
      ? await supabase.from("campaigns").update(payload).eq("id", editing.id)
      : await supabase.from("campaigns").insert({ ...payload, created_by: userId });
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Campanha atualizada" : "Campanha criada");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar campanha" : "Nova campanha"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Promo de fim de mês" />
          </div>

          <div className="space-y-1.5">
            <Label>Template (opcional)</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger><SelectValue placeholder="Sem template" /></SelectTrigger>
              <SelectContent>
                {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Filtrar por etiqueta</Label>
              <Select value={labelF || "all"} onValueChange={(v) => setLabelF(v === "all" ? "" : v as ConvLabel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {(Object.keys(LABEL_META) as ConvLabel[]).map((k) => (
                    <SelectItem key={k} value={k}>{LABEL_META[k].emoji} {LABEL_META[k].name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Filtrar por status</Label>
              <Select value={statusF || "all"} onValueChange={(v) => setStatusF(v === "all" ? "" : v as ConvStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(Object.keys(STATUS_LABEL) as ConvStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Agendar para (opcional)</Label>
            <Input type="datetime-local" value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)} />
          </div>

          {estimate !== null && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border p-2">
              <Users className="size-4" />
              <span>Alcance estimado: <strong className="text-foreground tabular-nums">{estimate}</strong> conversas</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar rascunho"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
