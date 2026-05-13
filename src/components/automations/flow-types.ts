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
  { name: string; emoji: string; accent: string; ring: string }
> = {
  trigger: {
    name: "Gatilho",
    emoji: "⚡",
    accent: "bg-amber-500/15 border-amber-500/60 text-amber-200",
    ring: "shadow-[0_0_0_1px_rgba(245,158,11,0.5),0_0_24px_-4px_rgba(245,158,11,0.55)]",
  },
  wait: {
    name: "Espera",
    emoji: "⏳",
    accent: "bg-sky-500/15 border-sky-500/60 text-sky-200",
    ring: "shadow-[0_0_0_1px_rgba(14,165,233,0.5),0_0_24px_-4px_rgba(14,165,233,0.55)]",
  },
  condition: {
    name: "Condição",
    emoji: "🔀",
    accent: "bg-fuchsia-500/15 border-fuchsia-500/60 text-fuchsia-200",
    ring: "shadow-[0_0_0_1px_rgba(217,70,239,0.5),0_0_24px_-4px_rgba(217,70,239,0.55)]",
  },
  action: {
    name: "Ação",
    emoji: "⚙️",
    accent: "bg-emerald-500/15 border-emerald-500/60 text-emerald-200",
    ring: "shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_0_24px_-4px_rgba(16,185,129,0.55)]",
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
