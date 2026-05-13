import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
  TRIGGER_LABEL,
  ACTION_LABEL,
  type FlowNodeData,
  type DbTrigger,
  type DbAction,
} from "./flow-types";
import { LABEL_META, STATUS_LABEL, type ConvLabel, type ConvStatus } from "@/lib/inbox-types";

type Profile = { id: string; name: string };
type Template = { id: string; title: string };

export function NodeConfigPanel({
  data,
  onChange,
  onDelete,
  canDelete,
  profiles,
  templates,
}: {
  data: FlowNodeData;
  onChange: (next: FlowNodeData) => void;
  onDelete: () => void;
  canDelete: boolean;
  profiles: Profile[];
  templates: Template[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</Label>
        <p className="text-sm font-medium mt-1 capitalize">{data.kind}</p>
      </div>

      {data.kind === "trigger" && (
        <>
          <div className="space-y-1.5">
            <Label>Quando</Label>
            <Select
              value={data.trigger}
              onValueChange={(v) =>
                onChange({
                  kind: "trigger",
                  trigger: v as DbTrigger,
                  config:
                    v === "no_reply" ? { minutes: 30 } : v === "keyword_inbound" ? { keyword: "" } : {},
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TRIGGER_LABEL) as DbTrigger[]).map((k) => (
                  <SelectItem key={k} value={k}>{TRIGGER_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {data.trigger === "no_reply" && (
            <div className="space-y-1.5">
              <Label>Minutos sem resposta</Label>
              <Input
                type="number"
                min={1}
                value={(data.config.minutes as number) ?? 30}
                onChange={(e) =>
                  onChange({ ...data, config: { minutes: Number(e.target.value) || 0 } })
                }
              />
            </div>
          )}
          {data.trigger === "keyword_inbound" && (
            <div className="space-y-1.5">
              <Label>Palavra-chave</Label>
              <Input
                value={(data.config.keyword as string) ?? ""}
                onChange={(e) => onChange({ ...data, config: { keyword: e.target.value } })}
              />
            </div>
          )}
        </>
      )}

      {data.kind === "wait" && (
        <div className="space-y-1.5">
          <Label>Aguardar (minutos)</Label>
          <Input
            type="number"
            min={1}
            value={data.minutes}
            onChange={(e) => onChange({ kind: "wait", minutes: Number(e.target.value) || 0 })}
          />
        </div>
      )}

      {data.kind === "condition" && (
        <div className="space-y-1.5">
          <Label>Pergunta avaliada</Label>
          <Input
            placeholder="Ex.: Lead respondeu?"
            value={data.question}
            onChange={(e) => onChange({ kind: "condition", question: e.target.value })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use as saídas <span className="text-emerald-400">Sim</span> e{" "}
            <span className="text-rose-400">Não</span> para encadear caminhos.
          </p>
        </div>
      )}

      {data.kind === "action" && (
        <>
          <div className="space-y-1.5">
            <Label>O que fazer</Label>
            <Select
              value={data.action}
              onValueChange={(v) => onChange({ kind: "action", action: v as DbAction, config: {} })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_LABEL) as DbAction[]).map((k) => (
                  <SelectItem key={k} value={k}>{ACTION_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {data.action === "transfer" && (
            <div className="space-y-1.5">
              <Label>Vendedor</Label>
              <Select
                value={(data.config.user_id as string) ?? ""}
                onValueChange={(v) => onChange({ ...data, config: { user_id: v } })}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {data.action === "set_label" && (
            <div className="space-y-1.5">
              <Label>Etiqueta</Label>
              <Select
                value={(data.config.label as string) ?? ""}
                onValueChange={(v) => onChange({ ...data, config: { label: v } })}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_META) as ConvLabel[]).map((k) => (
                    <SelectItem key={k} value={k}>{LABEL_META[k].emoji} {LABEL_META[k].name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {data.action === "set_status" && (
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={(data.config.status as string) ?? ""}
                onValueChange={(v) => onChange({ ...data, config: { status: v } })}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as ConvStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {data.action === "send_template" && (
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select
                value={(data.config.template_id as string) ?? ""}
                onValueChange={(v) => onChange({ ...data, config: { template_id: v } })}
              >
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      {canDelete && (
        <Button variant="destructive" size="sm" className="w-full mt-4" onClick={onDelete}>
          <Trash2 className="size-4 mr-1" /> Remover nó
        </Button>
      )}
    </div>
  );
}
