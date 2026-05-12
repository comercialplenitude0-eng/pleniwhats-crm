import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, Link2, RefreshCw } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  listRdPipelines,
  listRdDealCustomFields,
  findRdDealByPhone,
  getRdDeal,
  updateRdDeal,
  type RdFieldValue,
} from "@/lib/rd-crm.functions";
import type { Conversation } from "@/lib/inbox-types";

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
  customFields: Record<string, RdFieldValue>;
};

export function RdCrmSection({
  conversation,
  onLinked,
}: {
  conversation: Conversation;
  onLinked?: (dealId: string | null) => void;
}) {
  const findDeal = useServerFn(findRdDealByPhone);
  const getDeal = useServerFn(getRdDeal);
  const listFields = useServerFn(listRdDealCustomFields);
  const listPipes = useServerFn(listRdPipelines);
  const updateDeal = useServerFn(updateRdDeal);

  const [dealId, setDealId] = useState<string | null>(conversation.rd_deal_id ?? null);
  const [deal, setDeal] = useState<DealMirror | null>(null);
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [editValues, setEditValues] = useState<Record<string, RdFieldValue>>({});
  const [editStageId, setEditStageId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualId, setManualId] = useState("");

  // sync state when conversation changes
  useEffect(() => {
    setDealId(conversation.rd_deal_id ?? null);
    setDeal(null);
    setEditValues({});
    setEditStageId("");
    setManualId("");
  }, [conversation.id, conversation.rd_deal_id]);

  // load static metadata once
  useEffect(() => {
    void (async () => {
      try {
        const [f, p] = await Promise.all([listFields(), listPipes()]);
        setFields(f.fields);
        setPipelines(p.pipelines);
      } catch (e) {
        console.error("[RD CRM] metadata", e);
      }
    })();
  }, [listFields, listPipes]);

  const loadDeal = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const { deal: d } = await getDeal({ data: { dealId: id } });
        setDeal(d);
        setEditValues({ ...d.customFields });
        setEditStageId(d.stageId);
      } catch (e) {
        console.error(e);
        toast.error("Não foi possível carregar o card no RD CRM");
      } finally {
        setLoading(false);
      }
    },
    [getDeal],
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
    setLinking(true);
    try {
      const { dealId: found } = await findDeal({ data: { phone: conversation.contact_phone } });
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
    setSaving(true);
    try {
      // diff: só envia campos alterados
      const changed: Record<string, RdFieldValue> = {};
      for (const [k, v] of Object.entries(editValues)) {
        const before = deal.customFields[k] ?? null;
        if (JSON.stringify(before) !== JSON.stringify(v)) changed[k] = v;
      }
      const stageChanged = editStageId && editStageId !== deal.stageId ? editStageId : undefined;
      if (!stageChanged && Object.keys(changed).length === 0) {
        toast.info("Nada para salvar");
        return;
      }
      await updateDeal({
        data: {
          dealId: deal.id,
          ...(stageChanged ? { stageId: stageChanged } : {}),
          ...(Object.keys(changed).length ? { customFields: changed } : {}),
        },
      });
      toast.success("RD CRM atualizado");
      await loadDeal(deal.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar RD CRM");
    } finally {
      setSaving(false);
    }
  }

  // ----- Render -----
  if (!dealId) {
    return (
      <div className="space-y-3 p-4 border rounded-lg bg-background">
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
        <div className="flex gap-2">
          <Input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="ID do card no RD CRM"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="secondary" onClick={manualLink} disabled={!manualId.trim()}>
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

  if (t === "list" || t === "select" || t === "single_select") {
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

  if (t === "multi_select" || t === "multiple_select" || t === "checklist") {
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

  // default: text
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
