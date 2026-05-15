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
    accent:
      "bg-[oklch(0.96_0.05_75)] dark:bg-[oklch(0.24_0.06_75)] border-[oklch(0.78_0.13_75)] dark:border-[oklch(0.50_0.12_75)] text-card-foreground",
    ring: "shadow-[0_0_0_1.5px_oklch(0.72_0.16_75)]",
    dot: "bg-[oklch(0.72_0.16_75)]",
  },
  wait: {
    name: "Espera",
    emoji: "",
    accent:
      "bg-[oklch(0.95_0.05_220)] dark:bg-[oklch(0.24_0.06_220)] border-[oklch(0.75_0.10_220)] dark:border-[oklch(0.48_0.10_220)] text-card-foreground",
    ring: "shadow-[0_0_0_1.5px_oklch(0.65_0.14_220)]",
    dot: "bg-[oklch(0.65_0.14_220)]",
  },
  condition: {
    name: "Condição",
    emoji: "",
    accent:
      "bg-[oklch(0.94_0.05_300)] dark:bg-[oklch(0.26_0.07_300)] border-[oklch(0.72_0.13_300)] dark:border-[oklch(0.50_0.13_300)] text-card-foreground",
    ring: "shadow-[0_0_0_1.5px_oklch(0.60_0.18_300)]",
    dot: "bg-[oklch(0.60_0.18_300)]",
  },
  action: {
    name: "Ação",
    emoji: "",
    accent:
      "bg-[oklch(0.94_0.06_155)] dark:bg-[oklch(0.25_0.07_155)] border-[oklch(0.70_0.13_155)] dark:border-[oklch(0.48_0.12_155)] text-card-foreground",
    ring: "shadow-[0_0_0_1.5px_oklch(0.60_0.16_155)]",
    dot: "bg-[oklch(0.60_0.16_155)]",
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
