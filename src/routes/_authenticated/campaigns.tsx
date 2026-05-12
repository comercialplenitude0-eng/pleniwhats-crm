import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  Upload, Filter, Database as DatabaseIcon, FileSpreadsheet, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listRdPipelines, fetchRdStageDeals } from "@/lib/rd-crm.functions";
import { Switch } from "@/components/ui/switch";
import {
  LABEL_META, STATUS_LABEL, formatTime,
  type ConvLabel, type ConvStatus,
} from "@/lib/inbox-types";
import type { Database } from "@/integrations/supabase/types";

type CampaignStatus = Database["public"]["Enums"]["campaign_status"];
type CampaignSource = "filter" | "csv" | "rd_station";

type Recipient = { phone: string; name?: string; vars?: Record<string, string> };

type Campaign = {
  id: string;
  name: string;
  content: string;
  template_id: string | null;
  source: CampaignSource;
  filter_label: ConvLabel | null;
  filter_status: ConvStatus | null;
  recipients: Recipient[];
  rd_segment_id: string | null;
  rd_segment_name: string | null;
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

const SOURCE_META: Record<CampaignSource, { label: string; icon: typeof Filter }> = {
  filter: { label: "Filtro de conversas", icon: Filter },
  csv: { label: "Planilha CSV", icon: FileSpreadsheet },
  rd_station: { label: "Segmento RD Station", icon: DatabaseIcon },
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
    setCampaigns((c.data ?? []) as unknown as Campaign[]);
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
            Disparos em massa por filtro, planilha CSV ou segmento RD Station.
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
                      <TableHead>Origem</TableHead>
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
                      const SrcIcon = SOURCE_META[c.source].icon;
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{c.name}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">{c.content}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <SrcIcon className="size-3.5 text-muted-foreground" />
                              <span>{SOURCE_META[c.source].label}</span>
                            </div>
                            {c.source === "filter" && (c.filter_label || c.filter_status) && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {c.filter_label && <>{LABEL_META[c.filter_label].emoji} {LABEL_META[c.filter_label].name} </>}
                                {c.filter_status && <>· {STATUS_LABEL[c.filter_status]}</>}
                              </div>
                            )}
                            {c.source === "rd_station" && c.rd_segment_name && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">{c.rd_segment_name}</div>
                            )}
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

/* ---------- CSV parser (simple, supports quoted commas) ---------- */
function parseCSV(text: string): Recipient[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const split = (line: string) => {
    const out: string[] = [];
    let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const phoneIdx = headers.findIndex((h) => ["phone", "telefone", "celular", "whatsapp"].includes(h));
  const nameIdx = headers.findIndex((h) => ["name", "nome", "contato"].includes(h));
  if (phoneIdx === -1) throw new Error('CSV precisa de uma coluna "phone" ou "telefone"');
  const out: Recipient[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i]);
    const phone = (cols[phoneIdx] || "").replace(/[^\d+]/g, "");
    if (!phone) continue;
    const vars: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (j !== phoneIdx && j !== nameIdx && cols[j]) vars[h] = cols[j];
    });
    out.push({
      phone,
      name: nameIdx >= 0 ? cols[nameIdx] : undefined,
      vars: Object.keys(vars).length ? vars : undefined,
    });
  }
  return out;
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
  const [source, setSource] = useState<CampaignSource>("filter");
  const [labelF, setLabelF] = useState<ConvLabel | "">("");
  const [statusF, setStatusF] = useState<ConvStatus | "">("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [csvName, setCsvName] = useState<string>("");
  const [rdSegmentId, setRdSegmentId] = useState("");
  const [rdSegmentName, setRdSegmentName] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [rdSegments, setRdSegments] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [previewingRd, setPreviewingRd] = useState(false);
  const listSegmentsFn = useServerFn(listRdSegments);
  const fetchContactsFn = useServerFn(fetchRdSegmentContacts);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setContent(editing.content);
      setTemplateId(editing.template_id ?? "");
      setSource(editing.source);
      setLabelF(editing.filter_label ?? "");
      setStatusF(editing.filter_status ?? "");
      setRecipients(editing.recipients ?? []);
      setCsvName("");
      setRdSegmentId(editing.rd_segment_id ?? "");
      setRdSegmentName(editing.rd_segment_name ?? "");
      setScheduledAt(editing.scheduled_at ? editing.scheduled_at.slice(0, 16) : "");
    } else {
      setName(""); setContent(""); setTemplateId("");
      setSource("filter");
      setLabelF(""); setStatusF("");
      setRecipients([]); setCsvName("");
      setRdSegmentId(""); setRdSegmentName("");
      setScheduledAt("");
    }
  }, [editing, open]);

  // Estimate recipients per source
  useEffect(() => {
    if (!open) return;
    if (source === "csv") { setEstimate(recipients.length); return; }
    if (source === "rd_station") { setEstimate(recipients.length || (rdSegmentId ? null : 0)); return; }
    let cancelled = false;
    (async () => {
      let q = supabase.from("conversations").select("contact_phone", { count: "exact", head: true });
      if (labelF) q = q.eq("label", labelF);
      if (statusF) q = q.eq("status", statusF);
      const { count } = await q;
      if (!cancelled) setEstimate(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [open, source, labelF, statusF, recipients.length, rdSegmentId]);

  // Carrega segmentos do RD Station ao abrir a aba
  useEffect(() => {
    if (!open || source !== "rd_station" || rdSegments.length > 0 || loadingSegments) return;
    setLoadingSegments(true);
    listSegmentsFn()
      .then((r) => setRdSegments(r?.segments ?? []))
      .catch((e) => toast.error(`RD Station: ${(e as Error).message}`))
      .finally(() => setLoadingSegments(false));
  }, [open, source]);

  async function previewRdContacts() {
    if (!rdSegmentId) return toast.error("Selecione um segmento");
    setPreviewingRd(true);
    try {
      const r = await fetchContactsFn({ data: { segmentId: rdSegmentId } });
      const list = r?.recipients ?? [];
      setRecipients(list);
      toast.success(`${list.length} contatos com telefone (${r?.totalRaw ?? 0} no segmento)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPreviewingRd(false);
    }
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t && !content) setContent(t.content);
  }

  async function onCsvFile(file: File) {
    try {
      const text = await file.text();
      const list = parseCSV(text);
      if (list.length === 0) return toast.error("Nenhum contato válido encontrado");
      setRecipients(list);
      setCsvName(file.name);
      toast.success(`${list.length} contatos importados`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function save() {
    if (!name.trim()) return toast.error("Dê um nome à campanha");
    if (!content.trim()) return toast.error("Conteúdo obrigatório");
    if (source === "csv" && recipients.length === 0)
      return toast.error("Importe um CSV com contatos");
    if (source === "rd_station" && !rdSegmentId.trim())
      return toast.error("Informe o ID do segmento RD Station");

    setSaving(true);
    const total =
      source === "csv" ? recipients.length :
      source === "rd_station" ? recipients.length : // 0 se ainda não pré-carregou; worker pode buscar
      (estimate ?? 0);

    const payload = {
      name: name.trim(),
      content: content.trim(),
      template_id: templateId || null,
      source,
      filter_label: source === "filter" ? ((labelF || null) as ConvLabel | null) : null,
      filter_status: source === "filter" ? ((statusF || null) as ConvStatus | null) : null,
      recipients: source === "csv" || source === "rd_station" ? recipients : [],
      rd_segment_id: source === "rd_station" ? rdSegmentId.trim() : null,
      rd_segment_name: source === "rd_station" ? (rdSegmentName.trim() || null) : null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      total_recipients: total,
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
            <p className="text-[10px] text-muted-foreground">
              Use <code>{"{{nome}}"}</code> ou outras variáveis do CSV / RD Station.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Origem dos contatos</Label>
            <Tabs value={source} onValueChange={(v) => setSource(v as CampaignSource)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="filter" className="text-xs">
                  <Filter className="size-3.5 mr-1" /> Filtro
                </TabsTrigger>
                <TabsTrigger value="csv" className="text-xs">
                  <FileSpreadsheet className="size-3.5 mr-1" /> Planilha
                </TabsTrigger>
                <TabsTrigger value="rd_station" className="text-xs">
                  <DatabaseIcon className="size-3.5 mr-1" /> RD Station
                </TabsTrigger>
              </TabsList>

              <TabsContent value="filter" className="grid grid-cols-2 gap-3 pt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Etiqueta</Label>
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
                  <Label className="text-xs">Status</Label>
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
              </TabsContent>

              <TabsContent value="csv" className="pt-3 space-y-2">
                <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-accent/50 transition">
                  <Upload className="size-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {csvName || recipients.length > 0
                      ? `${csvName || "CSV carregado"} · ${recipients.length} contatos`
                      : "Clique para enviar um arquivo .csv"}
                  </span>
                  <input
                    type="file" accept=".csv,text/csv" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onCsvFile(f);
                    }}
                  />
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Cabeçalhos aceitos: <code>phone</code>/<code>telefone</code> (obrigatório),
                  <code> nome</code>, e quaisquer outras colunas viram variáveis (ex.:
                  <code> {"{{cidade}}"}</code>).
                </p>
              </TabsContent>

              <TabsContent value="rd_station" className="pt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center justify-between">
                    Segmento
                    <button type="button" className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                      onClick={() => {
                        setRdSegments([]); setLoadingSegments(true);
                        listSegmentsFn()
                          .then((r) => setRdSegments(r?.segments ?? []))
                          .catch((e) => toast.error((e as Error).message))
                          .finally(() => setLoadingSegments(false));
                      }}>
                      <RefreshCw className="size-3" /> Recarregar
                    </button>
                  </Label>
                  {loadingSegments ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 border rounded-md">
                      <Loader2 className="size-3.5 animate-spin" /> Carregando segmentos...
                    </div>
                  ) : rdSegments.length > 0 ? (
                    <Select value={rdSegmentId} onValueChange={(v) => {
                      setRdSegmentId(v);
                      const s = rdSegments.find((x) => x.id === v);
                      if (s) setRdSegmentName(s.name);
                      setRecipients([]);
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione um segmento" /></SelectTrigger>
                      <SelectContent>
                        {rdSegments.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={rdSegmentId} onChange={(e) => setRdSegmentId(e.target.value)}
                      placeholder="ID do segmento (manual)" />
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" className="w-full"
                  onClick={previewRdContacts} disabled={previewingRd || !rdSegmentId}>
                  {previewingRd ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Users className="size-3.5 mr-1" />}
                  {recipients.length > 0
                    ? `${recipients.length} contatos prontos · atualizar`
                    : "Buscar contatos do segmento"}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Os contatos são buscados via API do RD Station no momento do envio.
                  Use "Buscar contatos" para validar antes de agendar.
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-1.5">
            <Label>Agendar para (opcional)</Label>
            <Input type="datetime-local" value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)} />
          </div>

          {estimate !== null && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border p-2">
              <Users className="size-4" />
              <span>Alcance estimado: <strong className="text-foreground tabular-nums">{estimate}</strong> contatos</span>
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
