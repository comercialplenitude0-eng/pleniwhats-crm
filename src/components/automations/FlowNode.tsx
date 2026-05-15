import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Copy, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NODE_META,
  TRIGGER_LABEL,
  ACTION_LABEL,
  type FlowNodeData,
} from "./flow-types";
import { LABEL_META, STATUS_LABEL, type ConvLabel, type ConvStatus } from "@/lib/inbox-types";

function emit(action: "duplicate" | "delete", id: string) {
  window.dispatchEvent(new CustomEvent("flow-node-action", { detail: { action, id } }));
}

function summarize(data: FlowNodeData): string {
  switch (data.kind) {
    case "trigger": {
      if (data.trigger === "no_reply")
        return `Sem resposta há ${(data.config.minutes as number) ?? "?"} min`;
      if (data.trigger === "keyword_inbound")
        return `Contém "${(data.config.keyword as string) || "?"}"`;
      return TRIGGER_LABEL[data.trigger];
    }
    case "wait":
      return `Aguardar ${data.minutes} min`;
    case "condition":
      return data.question || "Defina a pergunta";
    case "action": {
      if (data.action === "set_label") {
        const l = data.config.label as ConvLabel | undefined;
        return l ? `Etiqueta: ${LABEL_META[l]?.name ?? l}` : "Aplicar etiqueta";
      }
      if (data.action === "set_status") {
        const s = data.config.status as ConvStatus | undefined;
        return s ? `Status: ${STATUS_LABEL[s] ?? s}` : "Alterar status";
      }
      if (data.action === "transfer")
        return data.config.user_id ? "Transferir vendedor" : "Escolher vendedor";
      if (data.action === "send_template")
        return data.config.template_id ? "Enviar template" : "Escolher template";
      return ACTION_LABEL[data.action];
    }
  }
}

export const FlowNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const meta = NODE_META[d.kind];
  const isCondition = d.kind === "condition";
  const isTrigger = d.kind === "trigger";

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card min-w-[240px] transition-all shadow-sm hover:shadow-md relative",
        meta.accent,
        selected && meta.ring,
      )}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          isConnectable
          className="!w-2.5 !h-2.5 !bg-primary !border !border-background"
        />
      )}
      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", meta.dot)} />
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{meta.name}</span>
        <div
          className={cn(
            "ml-auto flex items-center gap-0.5 transition-opacity nodrag nopan",
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); emit("duplicate", id); }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
            title="Duplicar"
          >
            <Copy className="size-3" />
          </button>
          {!isTrigger && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); emit("delete", id); }}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
              title="Excluir"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
      <div className="px-4 pb-3 text-sm font-normal text-foreground">{summarize(d)}</div>

      {isCondition ? (
        <div className="px-4 pb-2.5 flex items-center justify-between gap-2 text-[10px] font-medium tracking-wide">
          <span className="text-[oklch(0.78_0.12_240)]">Sim</span>
          <span className="text-muted-foreground">Não</span>
        </div>
      ) : null}

      {isCondition ? (
        <>
          <Handle
            id="yes"
            type="source"
            position={Position.Bottom}
            isConnectable
            style={{ left: "25%" }}
            className="!w-2.5 !h-2.5 !bg-[oklch(0.78_0.12_240)] !border !border-background"
          />
          <Handle
            id="no"
            type="source"
            position={Position.Bottom}
            isConnectable
            style={{ left: "75%" }}
            className="!w-2.5 !h-2.5 !bg-muted-foreground !border !border-background"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable
          className="!w-2.5 !h-2.5 !bg-primary !border !border-background"
        />
      )}
    </div>
  );
});
FlowNode.displayName = "FlowNode";
