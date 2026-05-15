import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FlowNode } from "./FlowNode";
import { NodeConfigPanel } from "./NodeConfigPanel";
import {
  NODE_META,
  emptyGraph,
  type FlowGraph,
  type FlowNodeData,
  type FlowNodeKind,
  type DbTrigger,
  type DbAction,
} from "./flow-types";

const nodeTypes = { trigger: FlowNode, wait: FlowNode, condition: FlowNode, action: FlowNode };

type Profile = { id: string; name: string };
type Template = { id: string; title: string };

export type SaveResult = {
  name: string;
  enabled: boolean;
  graph: FlowGraph;
  trigger: DbTrigger;
  trigger_config: Record<string, unknown>;
  action: DbAction;
  action_config: Record<string, unknown>;
};

export function FlowBuilder({
  initialName,
  initialEnabled,
  initialGraph,
  profiles,
  templates,
  onBack,
  onSave,
  saving,
}: {
  initialName: string;
  initialEnabled: boolean;
  initialGraph: FlowGraph;
  profiles: Profile[];
  templates: Template[];
  onBack: () => void;
  onSave: (data: SaveResult) => Promise<void> | void;
  saving: boolean;
}) {
  return (
    <ReactFlowProvider>
      <Inner
        initialName={initialName}
        initialEnabled={initialEnabled}
        initialGraph={initialGraph}
        profiles={profiles}
        templates={templates}
        onBack={onBack}
        onSave={onSave}
        saving={saving}
      />
    </ReactFlowProvider>
  );
}

function Inner({
  initialName,
  initialEnabled,
  initialGraph,
  profiles,
  templates,
  onBack,
  onSave,
  saving,
}: Parameters<typeof FlowBuilder>[0]) {
  const [name, setName] = useState(initialName);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(
    initialGraph.nodes as unknown as Node[],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialGraph.edges as unknown as Edge[],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const idRef = useRef(0);
  const nextId = (kind: FlowNodeKind) => `${kind}-${Date.now()}-${++idRef.current}`;
  const automationEdgeStyle = useMemo(
    () => ({ stroke: "var(--primary)", strokeWidth: 2.5 }),
    [],
  );
  const [isLight, setIsLight] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("light"),
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const obs = new MutationObserver(() =>
      setIsLight(document.documentElement.classList.contains("light")),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            animated: true,
            type: "smoothstep",
            style: automationEdgeStyle,
          },
          eds,
        ),
      ),
    [automationEdgeStyle, setEdges],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, n) => setSelectedId(n.id), []);
  // Não desselecionar ao clicar no canvas — mantém o nó editável até o usuário trocar de seleção

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const addNode = (kind: FlowNodeKind) => {
    const id = nextId(kind);
    const defaultData: Record<FlowNodeKind, FlowNodeData> = {
      trigger: { kind: "trigger", trigger: "new_conversation", config: {} },
      wait: { kind: "wait", minutes: 60 },
      condition: { kind: "condition", question: "Lead respondeu?" },
      action: { kind: "action", action: "set_label", config: {} },
    };
    const newNode: Node = {
      id,
      type: kind,
      position: { x: 240 + Math.random() * 120, y: 200 + Math.random() * 120 },
      data: defaultData[kind] as unknown as Record<string, unknown>,
    };
    setNodes((ns) => [...ns, newNode]);
    setSelectedId(id);
  };

  const updateNodeData = (id: string, next: FlowNodeData) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: next as unknown as Record<string, unknown> } : n)),
    );
  };

  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId((s) => (s === id ? null : s));
  };

  const duplicateNode = (id: string) => {
    setNodes((ns) => {
      const src = ns.find((n) => n.id === id);
      if (!src) return ns;
      const kind = (src.data as unknown as FlowNodeData).kind;
      if (kind === "trigger") {
        toast.error("Gatilho não pode ser duplicado");
        return ns;
      }
      const newId = `${kind}-${Date.now()}-${++idRef.current}`;
      const clone: Node = {
        ...src,
        id: newId,
        position: { x: src.position.x + 40, y: src.position.y + 40 },
        data: JSON.parse(JSON.stringify(src.data)),
        selected: false,
      };
      return [...ns, clone];
    });
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const requestDelete = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      if ((node.data as unknown as FlowNodeData).kind === "trigger") {
        toast.error("O nó de Gatilho não pode ser excluído");
        return;
      }
      setConfirmDeleteId(id);
    },
    [nodes],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ action: "delete" | "duplicate"; id: string }>).detail;
      if (!detail) return;
      if (detail.action === "delete") requestDelete(detail.id);
      else if (detail.action === "duplicate") duplicateNode(detail.id);
    };
    window.addEventListener("flow-node-action", handler);
    return () => window.removeEventListener("flow-node-action", handler);
  }, [requestDelete]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        requestDelete(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, requestDelete]);

  async function handleSave() {
    if (!name.trim()) return toast.error("Dê um nome ao fluxo");
    const triggerNode = nodes.find((n) => (n.data as unknown as FlowNodeData).kind === "trigger");
    const actionNode = nodes.find((n) => (n.data as unknown as FlowNodeData).kind === "action");
    if (!triggerNode) return toast.error("Adicione um nó de Gatilho");
    if (!actionNode) return toast.error("Adicione ao menos um nó de Ação");

    const td = triggerNode.data as unknown as Extract<FlowNodeData, { kind: "trigger" }>;
    const ad = actionNode.data as unknown as Extract<FlowNodeData, { kind: "action" }>;

    const graph: FlowGraph = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as FlowNodeKind,
        position: n.position,
        data: n.data as unknown as FlowNodeData,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        label: typeof e.label === "string" ? e.label : undefined,
      })),
    };

    await onSave({
      name: name.trim(),
      enabled,
      graph,
      trigger: td.trigger,
      trigger_config: td.config,
      action: ad.action,
      action_config: ad.config,
    });
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-background">
      {/* Toolbar */}
      <header className="px-4 sm:px-6 py-3 border-b bg-card flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-[180px]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do fluxo..."
            className="h-9 text-sm font-medium border-0 bg-transparent focus-visible:ring-1 px-2"
          />
          <p className="text-[11px] text-muted-foreground px-2">
            Clique nos nós para configurar · Arraste para mover
          </p>
        </div>

        <div className="hidden md:flex items-center gap-1 bg-muted/30 border border-border/60 rounded-lg p-1">
          {(Object.keys(NODE_META) as FlowNodeKind[]).map((k) => (
            <button
              key={k}
              onClick={() => addNode(k)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground transition"
            >
              <span className={`size-1.5 rounded-full ${NODE_META[k].dot}`} />
              {NODE_META[k].name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="enabled" className="text-xs">Ativa</Label>
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <Button onClick={handleSave} disabled={saving} size="sm">
          <Save className="size-4 mr-1" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </header>

      {/* Mobile palette */}
      <div className="md:hidden px-4 py-2 border-b bg-card flex gap-2 overflow-x-auto">
        {(Object.keys(NODE_META) as FlowNodeKind[]).map((k) => (
          <button
            key={k}
            onClick={() => addNode(k)}
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border border-border/60 bg-card text-muted-foreground"
          >
            <Plus className="size-3" />
            <span className={`size-1.5 rounded-full ${NODE_META[k].dot}`} />
            {NODE_META[k].name}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            colorMode={isLight ? "light" : "dark"}
            style={{ background: "var(--background)" }}
            connectionRadius={28}
            connectionLineStyle={automationEdgeStyle}
            defaultEdgeOptions={{ animated: true, type: "smoothstep", style: automationEdgeStyle }}
          >
            <Background gap={20} size={1} color="var(--border)" />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable className="!bg-card !border" />
          </ReactFlow>
        </div>

        {/* Side config panel — sempre visível em desktop */}
        <aside className="hidden md:flex w-[300px] shrink-0 border-l bg-card overflow-y-auto p-4 flex-col">
          {selectedNode ? (
            <NodeConfigPanel
              data={selectedNode.data as unknown as FlowNodeData}
              onChange={(next) => updateNodeData(selectedNode.id, next)}
              onDelete={() => deleteNode(selectedNode.id)}
              canDelete={
                (selectedNode.data as unknown as FlowNodeData).kind !== "trigger" ||
                nodes.filter((n) => (n.data as unknown as FlowNodeData).kind === "trigger").length > 1
              }
              profiles={profiles}
              templates={templates}
            />
          ) : (
            <div className="flex-1 grid place-items-center text-center text-xs text-muted-foreground px-4">
              <div>
                <div className="text-3xl mb-2 opacity-60">👆</div>
                Clique em um nó do canvas para editar suas configurações.
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Mobile config sheet */}
      {selectedNode && (
        <div className="md:hidden border-t bg-card p-4 max-h-[55vh] overflow-y-auto">
          <NodeConfigPanel
            data={selectedNode.data as unknown as FlowNodeData}
            onChange={(next) => updateNodeData(selectedNode.id, next)}
            onDelete={() => deleteNode(selectedNode.id)}
            canDelete={
              (selectedNode.data as unknown as FlowNodeData).kind !== "trigger" ||
              nodes.filter((n) => (n.data as unknown as FlowNodeData).kind === "trigger").length > 1
            }
            profiles={profiles}
            templates={templates}
          />
        </div>
      )}

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este nó?</AlertDialogTitle>
            <AlertDialogDescription>
              O nó e suas conexões serão removidos do fluxo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deleteNode(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { emptyGraph };
