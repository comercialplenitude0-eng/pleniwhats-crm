import { useEffect, useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, Link2, RefreshCw, Star, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  listRdPipelines,
  listRdDealCustomFields,
  findRdDealByPhone,
  getRdDeal,
  updateRdDeal,
  createRdDeal,
  type RdFieldValue,
} from "@/lib/rd-crm.functions";
import type { Conversation } from "@/lib/inbox-types";
import { cn } from "@/lib/utils";

type Pipeline = { id: string; name: string; stages: Array<{ id: string; name: string }> };
type CustomFieldDef = {
  id: string;
  label: string;
  type: string;
  options: Array<{ id: string; label: string }>;
};
type DealMirror = {
  id: string;
  name: string;
  stageId: string;
  stageName: string;
  pipelineId: string;
  pipelineName: string;
  rating: number | null;
  predictionDate: string | null;
  amountTotal: number | null;
  ownerId: string | null;
  ownerName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  customFields: Record<string, RdFieldValue>;
};

export function RdCrmSection({
  conversation,
  onLinked,
}: {
  conversation: Conversation;
  onLinked?: (dealId: string | null) => void;
}) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const findDeal = useServerFn(findRdDealByPhone);
  const getDeal = useServerFn(getRdDeal);
  const listFields = useServerFn(listRdDealCustomFields);
  const listPipes = useServerFn(listRdPipelines);
  const updateDeal = useServerFn(updateRdDeal);
  const createDeal = useServerFn(createRdDeal);

  const [dealId, setDealId] = useState<string | null>(conversation.rd_deal_id ?? null);
  const [deal, setDeal] = useState<DealMirror | null>(null);
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  // edit (existing deal)
  const [editValues, setEditValues] = useState<Record<string, RdFieldValue>>({});
  const [editStageId, setEditStageId] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editRating, setEditRating] = useState<number | null>(null);
  const [editPrediction, setEditPrediction] = useState<string>("");
  const [editAmount, setEditAmount] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualId, setManualId] = useState("");

  // create flow
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cPipelineId, setCPipelineId] = useState<string>("");
  const [cStageId, setCStageId] = useState<string>("");
  const [cName, setCName] = useState<string>("");
  const [cContactName, setCContactName] = useState<string>("");
  const [cContactPhone, setCContactPhone] = useState<string>("");
  const [cContactEmail, setCContactEmail] = useState<string>("");
  const [cRating, setCRating] = useState<number | null>(null);
  const [cPrediction, setCPrediction] = useState<string>("");
  const [cAmount, setCAmount] = useState<string>("");
  const [cValues, setCValues] = useState<Record<string, RdFieldValue>>({});

  // sync state when conversation changes
  useEffect(() => {
    setDealId(conversation.rd_deal_id ?? null);
    setDeal(null);
    setEditValues({});
    setEditStageId("");
    setEditName("");
    setEditRating(null);
    setEditPrediction("");
    setEditAmount("");
    setManualId("");
    setShowCreate(false);
    setCName(conversation.contact_name || "");
    setCContactName(conversation.contact_name || "");
    setCContactPhone(conversation.contact_phone || "");
    setCContactEmail("");
    setCRating(null);
    setCPrediction("");
    setCAmount("");
    setCValues({});
  }, [conversation.id, conversation.rd_deal_id, conversation.contact_name, conversation.contact_phone]);

  // load static metadata once
  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const [f, p] = await Promise.all([
          listFields({ headers }),
          listPipes({ headers }),
        ]);
        setFields(f.fields);
        setPipelines(p.pipelines);
      } catch (e) {
        console.error("[RD CRM] metadata", e);
      }
    })();
  }, [accessToken, listFields, listPipes]);

  // when entering create mode, default to first pipeline/stage
  useEffect(() => {
    if (!showCreate) return;
    if (!cPipelineId && pipelines[0]) {
      setCPipelineId(pipelines[0].id);
      setCStageId(pipelines[0].stages[0]?.id ?? "");
    }
  }, [showCreate, pipelines, cPipelineId]);

  const loadDeal = useCallback(
    async (id: string) => {
      if (!accessToken) {
        toast.error("Sessão expirada. Faça login novamente para carregar o card.");
        return;
      }
      setLoading(true);
      try {
        const { deal: d } = await getDeal({
          data: { dealId: id },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setDeal(d);
        setEditValues({ ...d.customFields });
        setEditStageId(d.stageId);
        setEditName(d.name);
        setEditRating(d.rating);
        setEditPrediction(d.predictionDate ?? "");
        setEditAmount(d.amountTotal != null ? String(d.amountTotal) : "");
      } catch (e) {
        console.error(e);
        toast.error("Não foi possível carregar o card no RD CRM");
      } finally {
        setLoading(false);
      }
    },
    [accessToken, getDeal],
  );

  useEffect(() => {
    if (dealId) void loadDeal(dealId);
  }, [dealId, loadDeal]);

  async function persistDealId(id: string | null) {
    await supabase.from("conversations").update({ rd_deal_id: id }).eq("id", conversation.id);
    setDealId(id);
    onLinked?.(id);
  }

  async function autoLink() {
    if (!accessToken) return toast.error("Sessão expirada. Faça login novamente para buscar o card.");
    setLinking(true);
    try {
      const { dealId: found } = await findDeal({
        data: { phone: conversation.contact_phone },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!found) {
        toast.error("Nenhum card encontrado no RD CRM para este telefone");
        return;
      }
      await persistDealId(found);
      toast.success("Card vinculado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao buscar card no RD CRM");
    } finally {
      setLinking(false);
    }
  }

  async function manualLink() {
    const id = manualId.trim();
    if (!id) return;
    await persistDealId(id);
  }

  async function unlink() {
    await persistDealId(null);
    setDeal(null);
  }

  async function saveAll() {
    if (!deal) return;
    if (!accessToken) return toast.error("Sessão expirada. Faça login novamente para salvar no RD CRM.");
    setSaving(true);
    try {
      const changedCustom: Record<string, RdFieldValue> = {};
      for (const [k, v] of Object.entries(editValues)) {
        const before = deal.customFields[k] ?? null;
        if (JSON.stringify(before) !== JSON.stringify(v)) changedCustom[k] = v;
      }
      const payload: {
        dealId: string;
        stageId?: string;
        name?: string;
        rating?: number | null;
        predictionDate?: string | null;
        amountTotal?: number | null;
        customFields?: Record<string, RdFieldValue>;
      } = { dealId: deal.id };
      if (editStageId && editStageId !== deal.stageId) payload.stageId = editStageId;
      if (editName !== deal.name) payload.name = editName;
      if ((editRating ?? null) !== (deal.rating ?? null)) payload.rating = editRating;
      const newPred = editPrediction || null;
      if ((newPred ?? null) !== (deal.predictionDate ?? null)) payload.predictionDate = newPred;
      const newAmount = editAmount === "" ? null : Number(editAmount);
      if ((newAmount ?? null) !== (deal.amountTotal ?? null)) payload.amountTotal = newAmount;
      if (Object.keys(changedCustom).length > 0) payload.customFields = changedCustom;

      if (Object.keys(payload).length <= 1) {
        toast.info("Nada para salvar");
        return;
      }
      await updateDeal({
        data: payload,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      toast.success("RD CRM atualizado");
      await loadDeal(deal.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar RD CRM");
    } finally {
      setSaving(false);
    }
  }

  async function submitCreate() {
    if (!accessToken) return toast.error("Sessão expirada. Faça login novamente.");
    if (!cName.trim()) return toast.error("Informe o nome do card");
    if (!cStageId) return toast.error("Escolha funil e etapa");
    if (!cContactName.trim() || !cContactPhone.trim())
      return toast.error("Informe o nome e telefone do contato");
    const emailTrim = cContactEmail.trim();
    if (!emailTrim) return toast.error("Informe o e-mail do contato");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim))
      return toast.error("E-mail inválido");
    setCreating(true);
    try {
      const r = await createDeal({
        data: {
          name: cName.trim(),
          stageId: cStageId,
          contactName: cContactName.trim(),
          contactPhone: cContactPhone.trim(),
          contactEmail: emailTrim,
          rating: cRating,
          predictionDate: cPrediction || null,
          amountTotal: cAmount === "" ? null : Number(cAmount),
          customFields: Object.keys(cValues).length > 0 ? cValues : undefined,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await persistDealId(r.dealId);
      toast.success("Card criado no RD CRM");
      setShowCreate(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar card no RD CRM");
    } finally {
      setCreating(false);
    }
  }

  // ----- Render: not linked -----
  if (!dealId) {
    if (showCreate) {
      const currentPipeline =
        pipelines.find((p) => p.id === cPipelineId) ?? pipelines[0];
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">
              Novo card no RD CRM
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nome do card</Label>
            <Input value={cName} onChange={(e) => setCName(e.target.value)} className="h-8 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Funil</Label>
              <Select
                value={cPipelineId}
                onValueChange={(v) => {
                  setCPipelineId(v);
                  const p = pipelines.find((x) => x.id === v);
                  setCStageId(p?.stages[0]?.id ?? "");
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Etapa</Label>
              <Select value={cStageId} onValueChange={setCStageId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(currentPipeline?.stages ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Contato — nome</Label>
            <Input value={cContactName} onChange={(e) => setCContactName(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input value={cContactPhone} onChange={(e) => setCContactPhone(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail *</Label>
              <Input type="email" required value={cContactEmail} onChange={(e) => setCContactEmail(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Previsão de fechamento</Label>
              <Input type="date" value={cPrediction} onChange={(e) => setCPrediction(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor total (R$)</Label>
              <Input type="number" value={cAmount} onChange={(e) => setCAmount(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Avaliação</Label>
            <RatingStars value={cRating} onChange={setCRating} />
          </div>

          {fields.length > 0 && (
            <div className="space-y-3">
              <Label className="text-xs uppercase text-muted-foreground tracking-wide">
                Campos personalizados
              </Label>
              {fields.map((f) => (
                <FieldEditor
                  key={f.id}
                  def={f}
                  value={cValues[f.id] ?? null}
                  onChange={(v) => setCValues((prev) => ({ ...prev, [f.id]: v }))}
                />
              ))}
            </div>
          )}

          <Button onClick={submitCreate} disabled={creating} className="w-full">
            {creating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
            Criar card no RD CRM
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-3 p-4 border rounded-lg bg-card">
        <div className="text-xs text-muted-foreground">
          Esta conversa ainda não está vinculada a um card no RD CRM.
        </div>
        <Button size="sm" onClick={autoLink} disabled={linking} className="w-full">
          {linking ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Link2 className="size-4 mr-2" />
          )}
          Buscar card pelo telefone
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowCreate(true)} className="w-full">
          <Plus className="size-4 mr-2" />
          Criar novo card no RD CRM
        </Button>
        <div className="flex gap-2 pt-1">
          <Input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="ID do card no RD CRM"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="ghost" onClick={manualLink} disabled={!manualId.trim()}>
            Vincular
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !deal) {
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!deal) return null;

  const currentPipeline =
    pipelines.find((p) => p.stages.some((s) => s.id === editStageId)) ??
    pipelines.find((p) => p.id === deal.pipelineId) ??
    pipelines[0];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">Card RD CRM</div>
          <div className="text-sm font-medium truncate">{deal.name || `#${deal.id}`}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {deal.pipelineName} · {deal.stageName}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="size-7" onClick={() => loadDeal(deal.id)} title="Recarregar">
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={unlink} title="Desvincular">
            <Link2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Nome do card</Label>
        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase text-muted-foreground tracking-wide">Etapa do funil</Label>
        <Select value={editStageId} onValueChange={setEditStageId}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Selecionar etapa" />
          </SelectTrigger>
          <SelectContent>
            {(currentPipeline?.stages ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pipelines.length > 1 && (
          <p className="text-[10px] text-muted-foreground">Funil: {currentPipeline?.name}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Previsão</Label>
          <Input type="date" value={editPrediction} onChange={(e) => setEditPrediction(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Valor total (R$)</Label>
          <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Avaliação</Label>
        <RatingStars value={editRating} onChange={setEditRating} />
      </div>

      {(deal.contactName || deal.contactPhone || deal.contactEmail || deal.ownerName) && (
        <div className="rounded-md border bg-card p-2.5 space-y-1 text-[11px] text-muted-foreground">
          {deal.contactName && <div>Contato: <span className="text-foreground">{deal.contactName}</span></div>}
          {deal.contactPhone && <div>Telefone: <span className="text-foreground">{deal.contactPhone}</span></div>}
          {deal.contactEmail && <div>E-mail: <span className="text-foreground">{deal.contactEmail}</span></div>}
          {deal.ownerName && <div>Responsável: <span className="text-foreground">{deal.ownerName}</span></div>}
        </div>
      )}

      <div className="space-y-3">
        <Label className="text-xs uppercase text-muted-foreground tracking-wide">
          Campos personalizados
        </Label>
        {fields.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Nenhum campo personalizado configurado no RD CRM.
          </p>
        ) : (
          fields.map((f) => (
            <FieldEditor
              key={f.id}
              def={f}
              value={editValues[f.id] ?? null}
              onChange={(v) => setEditValues((prev) => ({ ...prev, [f.id]: v }))}
            />
          ))
        )}
      </div>

      <Button onClick={saveAll} disabled={saving} className="w-full">
        {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
        Salvar no RD CRM
      </Button>
    </div>
  );
}

function RatingStars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className="text-muted-foreground hover:text-amber-500 transition-colors"
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
        >
          <Star className={cn("size-4", value && n <= value ? "fill-amber-500 text-amber-500" : "")} />
        </button>
      ))}
    </div>
  );
}

function FieldEditor({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDef;
  value: RdFieldValue;
  onChange: (v: RdFieldValue) => void;
}) {
  const t = (def.type || "text").toLowerCase();
  const labelEl = (
    <Label className="text-xs font-medium" htmlFor={`f-${def.id}`}>
      {def.label}
    </Label>
  );

  if (t.includes("check_box") || t === "checkbox" || t === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={`f-${def.id}`}
          checked={!!value}
          onCheckedChange={(v) => onChange(!!v)}
        />
        {labelEl}
      </div>
    );
  }

  const isMulti =
    t === "multi_select" || t === "multiple_select" || t === "checklist" || t.includes("multi");
  const isSingleList =
    !isMulti &&
    (t === "list" ||
      t === "select" ||
      t === "option" ||
      t === "single_select" ||
      t === "dropdown" ||
      t === "radio" ||
      (def.options && def.options.length > 0));

  if (isSingleList) {
    const cur = value == null ? "" : String(value);
    return (
      <div className="space-y-1">
        {labelEl}
        <Select
          value={cur}
          onValueChange={(v) => onChange(v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 text-sm" id={`f-${def.id}`}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {def.options.map((o) => (
              <SelectItem key={o.id || o.label} value={o.label || o.id}>
                {o.label || o.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (isMulti) {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="space-y-1.5">
        {labelEl}
        <div className="space-y-1 rounded-md border p-2 max-h-40 overflow-auto">
          {def.options.map((o) => {
            const v = o.label || o.id;
            const checked = arr.includes(v);
            return (
              <label key={o.id || o.label} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = c ? [...arr, v] : arr.filter((x) => x !== v);
                    onChange(next);
                  }}
                />
                {o.label || o.id}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (t === "int" || t === "integer" || t === "decimal" || t === "number" || t === "currency") {
    return (
      <div className="space-y-1">
        {labelEl}
        <Input
          id={`f-${def.id}`}
          type="number"
          value={value == null ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(null);
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : raw);
          }}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  if (t === "date") {
    const v = value == null ? "" : String(value).slice(0, 10);
    return (
      <div className="space-y-1">
        {labelEl}
        <Input
          id={`f-${def.id}`}
          type="date"
          value={v}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  if (t === "datetime" || t === "date_time") {
    const v = value == null ? "" : String(value).slice(0, 16);
    return (
      <div className="space-y-1">
        {labelEl}
        <Input
          id={`f-${def.id}`}
          type="datetime-local"
          value={v}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {labelEl}
      <Input
        id={`f-${def.id}`}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}
