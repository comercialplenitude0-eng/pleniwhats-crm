import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, isManagerRole } from "@/lib/auth";
import { listTags, upsertTag, deleteTag } from "@/lib/tags.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Tag, Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/tags")({
  component: TagsPage,
});

type TagRow = Awaited<ReturnType<typeof listTags>>[number];

type Form = {
  id: string | null;
  name: string;
  emoji: string;
  color: string;
  sort_order: number;
};

const emptyForm = (): Form => ({
  id: null,
  name: "",
  emoji: "",
  color: "#6366f1",
  sort_order: 100,
});

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#6b7280",
];

function TagsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const fetchList = useServerFn(listTags);
  const saveFn = useServerFn(upsertTag);
  const deleteFn = useServerFn(deleteTag);

  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role && !isManagerRole(role)) navigate({ to: "/inbox" });
  }, [role, navigate]);

  async function load() {
    try {
      const data = await fetchList();
      setTags(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openNew() {
    setForm({ ...emptyForm(), sort_order: (tags.at(-1)?.sort_order ?? 0) + 10 });
    setOpen(true);
  }

  function openEdit(t: TagRow) {
    setForm({
      id: t.id,
      name: t.name,
      emoji: t.emoji ?? "",
      color: t.color,
      sort_order: t.sort_order,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      await saveFn({
        data: {
          id: form.id ?? undefined,
          name: form.name.trim(),
          emoji: form.emoji.trim() || null,
          color: form.color,
          sort_order: form.sort_order,
        },
      });
      toast.success(form.id ? "Tag atualizada" : "Tag criada");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: TagRow) {
    if (t.is_system) {
      toast.error("Tags do sistema não podem ser apagadas.");
      return;
    }
    if (!confirm(`Apagar tag "${t.name}"? Ela será removida de todas as conversas.`)) return;
    try {
      await deleteFn({ data: { id: t.id } });
      toast.success("Tag apagada");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Tag className="h-6 w-6" /> Tags
          </h1>
          <p className="text-sm text-muted-foreground">
            Crie e gerencie as tags usadas para classificar conversas.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova tag</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo de tags</CardTitle>
          <CardDescription>
            Tags do sistema (Quente, Morno, Frio, Novo, Fechado) podem ser editadas mas não apagadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma tag ainda.</p>
          ) : (
            <ul className="space-y-2">
              {tags.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-muted/40"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xl">{t.emoji ?? "🏷️"}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {t.is_system && <Badge variant="secondary" className="text-xs">sistema</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      slug: <code>{t.slug}</code> · ordem: {t.sort_order}
                    </div>
                  </div>
                  <div
                    className="h-6 w-6 rounded-full border"
                    style={{ background: t.color }}
                    title={t.color}
                  />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(t)}
                    disabled={t.is_system}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar tag" : "Nova tag"}</DialogTitle>
            <DialogDescription>Defina nome, emoji e cor para identificar a tag.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nome</Label>
              <Input
                id="t-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: VIP"
                maxLength={60}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-emoji">Emoji (opcional)</Label>
                <Input
                  id="t-emoji"
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                  placeholder="⭐"
                  maxLength={4}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-order">Ordem</Label>
                <Input
                  id="t-order"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      form.color === c ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, color: c })}
                  />
                ))}
                <Input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="h-8 w-12 p-0.5"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
