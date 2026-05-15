import type { Database } from "@/integrations/supabase/types";

export type DbTrigger = Database["public"]["Enums"]["automation_trigger"];
export type DbAction = Database["public"]["Enums"]["automation_action"];

export type FlowNodeKind = "trigger" | "wait" | "condition" | "action";

export type TriggerNodeData = {
  kind: "trigger";
  trigger: DbTrigger;
  config: Record<string, unknown>;
};
export type WaitNodeData = {
  kind: "wait";
  minutes: number;
};
export type ConditionNodeData = {
  kind: "condition";
  question: string;
};
export type ActionNodeData = {
  kind: "action";
  action: DbAction;
  config: Record<string, unknown>;
};

export type FlowNodeData =
  | TriggerNodeData
  | WaitNodeData
  | ConditionNodeData
  | ActionNodeData;

export type FlowGraph = {
  nodes: Array<{
    id: string;
    type: FlowNodeKind;
    position: { x: number; y: number };
    data: FlowNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    label?: string;
  }>;
};

export const TRIGGER_LABEL: Record<DbTrigger, string> = {
  no_reply: "Sem resposta há X min",
  keyword_inbound: "Palavra-chave recebida",
  new_conversation: "Nova conversa",
};

export const ACTION_LABEL: Record<DbAction, string> = {
  transfer: "Transferir vendedor",
  set_label: "Aplicar etiqueta",
  set_status: "Alterar status",
  send_template: "Enviar template",
};

export const NODE_META: Record<
  FlowNodeKind,
  { name: string; emoji: string; accent: string; ring: string; dot: string }
> = {
  trigger: {
    name: "Gatilho",
    emoji: "",
    accent: "bg-card border-border/60 text-card-foreground",
    ring: "shadow-[0_0_0_1px_var(--primary)]",
    dot: "bg-[oklch(0.78_0.12_240)]",
  },
  wait: {
    name: "Espera",
    emoji: "",
    accent: "bg-card border-border/60 text-card-foreground",
    ring: "shadow-[0_0_0_1px_var(--primary)]",
    dot: "bg-[oklch(0.68_0.13_235)]",
  },
  condition: {
    name: "Condição",
    emoji: "",
    accent: "bg-card border-border/60 text-card-foreground",
    ring: "shadow-[0_0_0_1px_var(--primary)]",
    dot: "bg-[oklch(0.55_0.16_255)]",
  },
  action: {
    name: "Ação",
    emoji: "",
    accent: "bg-card border-border/60 text-card-foreground",
    ring: "shadow-[0_0_0_1px_var(--primary)]",
    dot: "bg-[oklch(0.42_0.18_265)]",
  },
};

export function emptyGraph(): FlowGraph {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 80, y: 120 },
        data: { kind: "trigger", trigger: "new_conversation", config: {} },
      },
    ],
    edges: [],
  };
}
