import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Loader2, Zap, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { MessageTemplate } from "@/lib/templates";
import { extractVars } from "@/lib/templates";

export const Route = createFileRoute("/_authenticated/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const { user, role } = useAuth();
  const [items, setItems] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<MessageTemplate> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("message_templates")
      .select("*")
      .order("shortcut", { ascending: true });
    setItems((data ?? []) as MessageTemplate[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function startNew() {
    setEditing({ shortcut: "", title: "", content: "", is_shared: false });
  }

  async function save() {
    if (!editing || !user) return;
    const shortcut = (editing.shortcut ?? "").trim().replace(/^\//, "").toLowerCase();
    const title = (editing.title ?? "").trim();
    const content = (editing.content ?? "").trim();
    if (!shortcut || !title || !content) return toast.error("Preencha atalho, título e conteúdo");
    setSaving(true);
    const payload = {
      shortcut,
      title,
      content,
      is_shared: !!editing.is_shared,
      owner_id: user.id,
    };
    const res = editing.id
      ? await supabase.from("message_templates").update(payload).eq("id", editing.id)
      : await supabase.from("message_templates").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Template salvo");
    setEditing(null);
    void load();
  }

  async function remove(t: MessageTemplate) {
    if (!confirm(`Excluir /${t.shortcut}?`)) return;
    const { error } = await supabase.from("message_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    void load();
  }

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="size-6 text-primary" /> Respostas rápidas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Use <code className="font-mono text-xs">/atalho</code> no chat. Variáveis:{" "}
              <code className="font-mono text-xs">{`{{nome}}`}</code>,{" "}
              <code className="font-mono text-xs">{`{{produto}}`}</code> etc.
            </p>
          </div>
          <Button onClick={startNew}>
            <Plus className="size-4 mr-1" /> Novo template
          </Button>
        </header>

        {editing && (
          <Card className="p-5 space-y-4 border-primary/40">
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
              <div className="space-y-1">
                <Label>Atalho</Label>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">/</span>
                  <Input
                    value={editing.shortcut ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, shortcut: e.target.value.replace(/\s+/g, "") })
                    }
                    placeholder="ola"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Título</Label>
                <Input
                  value={editing.title ?? ""}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Saudação inicial"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Conteúdo</Label>
              <Textarea
                value={editing.content ?? ""}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                rows={5}
                placeholder="Olá {{nome}}, tudo bem? Como posso te ajudar hoje?"
              />
              {editing.content && extractVars(editing.content).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {extractVars(editing.content).map((v) => (
                    <Badge key={v} variant="secondary" className="font-mono text-xs">
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!editing.is_shared}
                  onCheckedChange={(v) => setEditing({ ...editing, is_shared: v })}
                />
                <Share2 className="size-4 text-muted-foreground" />
                Compartilhar com a equipe
              </label>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            Nenhum template ainda. Crie o primeiro!
          </Card>
        ) : (
          <div className="grid gap-2">
            {items.map((t) => {
              const mine = t.owner_id === user?.id;
              const canEdit = mine || role === "gestor";
              return (
                <Card
                  key={t.id}
                  className="p-4 flex items-start gap-3 hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => canEdit && setEditing(t)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-primary">/{t.shortcut}</span>
                      <span className="font-medium">{t.title}</span>
                      {t.is_shared && (
                        <Badge variant="outline" className="text-xs">
                          <Share2 className="size-3 mr-1" />
                          Compartilhado
                        </Badge>
                      )}
                      {!mine && (
                        <Badge variant="secondary" className="text-xs">de outro usuário</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                      {t.content}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(t);
                      }}
                      aria-label="Excluir"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
