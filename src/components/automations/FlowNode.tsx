import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  NODE_META,
  TRIGGER_LABEL,
  ACTION_LABEL,
  type FlowNodeData,
} from "./flow-types";
import { LABEL_META, STATUS_LABEL, type ConvLabel, type ConvStatus } from "@/lib/inbox-types";

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

export const FlowNode = memo(({ data, selected }: NodeProps) => {
  const d = data as unknown as FlowNodeData;
  const meta = NODE_META[d.kind];
  const isCondition = d.kind === "condition";
  const isTrigger = d.kind === "trigger";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/80 backdrop-blur-sm min-w-[220px] transition-all",
        meta.accent,
        selected ? meta.ring : "shadow-md",
      )}
    >
      {!isTrigger && (
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-foreground/40 !border-0" />
      )}
      <div className="px-3 py-2 border-b border-current/20 flex items-center gap-2">
        <span className="text-base leading-none">{meta.emoji}</span>
        <span className="text-xs font-semibold uppercase tracking-wider">{meta.name}</span>
      </div>
      <div className="px-3 py-2.5 text-sm text-foreground/90">{summarize(d)}</div>

      {isCondition ? (
        <div className="px-3 pb-2 flex items-center justify-between gap-2 text-[10px] font-medium">
          <span className="text-emerald-300">✓ Sim</span>
          <span className="text-rose-300">✗ Não</span>
        </div>
      ) : null}

      {isCondition ? (
        <>
          <Handle
            id="yes"
            type="source"
            position={Position.Bottom}
            style={{ left: "25%" }}
            className="!w-2 !h-2 !bg-emerald-400 !border-0"
          />
          <Handle
            id="no"
            type="source"
            position={Position.Bottom}
            style={{ left: "75%" }}
            className="!w-2 !h-2 !bg-rose-400 !border-0"
          />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-foreground/40 !border-0" />
      )}
    </div>
  );
});
FlowNode.displayName = "FlowNode";
