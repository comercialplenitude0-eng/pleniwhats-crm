import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Workflow, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { FlowBuilder, emptyGraph, type SaveResult } from "@/components/automations/FlowBuilder";
import {
  NODE_META,
  type FlowGraph,
  type FlowNodeData,
  type FlowNodeKind,
} from "@/components/automations/flow-types";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  graph: FlowGraph;
};

type Profile = { id: string; name: string };
type Template = { id: string; title: string };

export const Route = createFileRoute("/_authenticated/automations")({
  component: AutomationsPage,
});

function AutomationsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [rules, setRules] = useState<Rule[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role && role !== "gestor") navigate({ to: "/inbox" });
  }, [role, navigate]);

  async function load() {
    const [r, p, t] = await Promise.all([
      supabase.from("automation_rules").select("id,name,enabled,graph").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id,name").order("name"),
      supabase.from("message_templates").select("id,title").order("title"),
    ]);
    const normalized = (r.data ?? []).map((row) => {
      const raw = row.graph as unknown as Partial<FlowGraph> | null;
      const graph: FlowGraph =
        raw && Array.isArray(raw.nodes) && raw.nodes.length > 0
          ? (raw as FlowGraph)
          : emptyGraph();
      return { id: row.id, name: row.name, enabled: row.enabled, graph };
    });
    setRules(normalized);
    setProfiles((p.data ?? []) as Profile[]);
    setTemplates((t.data ?? []) as Template[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(r: Rule) {
    const { error } = await supabase
      .from("automation_rules")
      .update({ enabled: !r.enabled })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function remove(r: Rule) {
    if (!confirm(`Remover fluxo "${r.name}"?`)) return;
    const { error } = await supabase.from("automation_rules").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Fluxo removido"); void load(); }
  }

  async function handleSave(payload: SaveResult) {
    setSaving(true);
    const body = {
      name: payload.name,
      enabled: payload.enabled,
      graph: payload.graph as never,
      trigger: payload.trigger,
      trigger_config: payload.trigger_config as never,
      action: payload.action,
      action_config: payload.action_config as never,
    };
    const res = editing
      ? await supabase.from("automation_rules").update(body).eq("id", editing.id)
      : await supabase.from("automation_rules").insert({ ...body, created_by: user?.id ?? null });
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Fluxo atualizado" : "Fluxo criado");
    setEditing(null);
    setCreating(false);
    void load();
  }

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Builder mode (full screen)
  if (creating || editing) {
    return (
      <FlowBuilder
        initialName={editing?.name ?? ""}
        initialEnabled={editing?.enabled ?? true}
        initialGraph={editing?.graph ?? emptyGraph()}
        profiles={profiles}
        templates={templates}
        onBack={() => { setEditing(null); setCreating(false); }}
        onSave={handleSave}
        saving={saving}
      />
    );
  }

  // List mode
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b bg-card flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
            <Workflow className="size-5 text-primary" /> Automações
          </h1>
          <p className="text-xs text-muted-foreground mt-1 hidden sm:block">
            Construa fluxos visuais que reagem a eventos do inbox.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="size-4 mr-1" /> Novo fluxo
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          {rules.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <Workflow className="size-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  Nenhum fluxo criado ainda. Comece montando seu primeiro mapa de automação.
                </p>
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4 mr-1" /> Criar primeiro fluxo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {rules.map((r) => {
                const counts = countByKind(r.graph);
                return (
                  <Card key={r.id} className="overflow-hidden hover:border-primary/40 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm truncate">{r.name}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {r.graph.nodes.length} nó{r.graph.nodes.length === 1 ? "" : "s"} ·{" "}
                            {r.graph.edges.length} conexão{r.graph.edges.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(counts) as FlowNodeKind[]).map((k) =>
                          counts[k] ? (
                            <Badge key={k} variant="outline" className={`text-[10px] ${NODE_META[k].accent}`}>
                              {NODE_META[k].emoji} {counts[k]} {NODE_META[k].name}
                            </Badge>
                          ) : null,
                        )}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setEditing(r)}>
                          <Pencil className="size-3.5 mr-1" /> Editar fluxo
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function countByKind(g: FlowGraph): Record<FlowNodeKind, number> {
  const out: Record<FlowNodeKind, number> = { trigger: 0, wait: 0, condition: 0, action: 0 };
  for (const n of g.nodes) {
    const k = (n.data as FlowNodeData).kind;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
