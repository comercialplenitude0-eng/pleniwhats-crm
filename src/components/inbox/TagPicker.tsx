import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listTags, listConversationTags, setConversationTags } from "@/lib/tags.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, Plus, Loader2, Settings2, X } from "lucide-react";
import { toast } from "sonner";

type Tag = { id: string; name: string; slug: string; emoji: string | null; color: string };

type Props = {
  conversationId: string;
};

export function TagPicker({ conversationId }: Props) {
  const fetchAll = useServerFn(listTags);
  const fetchAssigned = useServerFn(listConversationTags);
  const saveFn = useServerFn(setConversationTags);

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [all, mine] = await Promise.all([
        fetchAll(),
        fetchAssigned({ data: { conversationId } }),
      ]);
      setAllTags(all);
      setSelected(mine as Tag[]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (conversationId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function persist(next: Tag[]) {
    setSelected(next);
    setSaving(true);
    try {
      await saveFn({ data: { conversationId, tagIds: next.map((t) => t.id) } });
    } catch (e) {
      toast.error((e as Error).message);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function toggle(tag: Tag) {
    const exists = selected.find((t) => t.id === tag.id);
    const next = exists ? selected.filter((t) => t.id !== tag.id) : [...selected, tag];
    void persist(next);
  }

  function remove(tag: Tag) {
    void persist(selected.filter((t) => t.id !== tag.id));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 items-center">
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : selected.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Sem tags</span>
        ) : (
          selected.map((t) => (
            <Badge
              key={t.id}
              variant="outline"
              className="gap-1 pr-1 text-xs"
              style={{ borderColor: t.color, color: t.color, background: `${t.color}15` }}
            >
              {t.emoji && <span>{t.emoji}</span>}
              <span>{t.name}</span>
              <button
                type="button"
                onClick={() => remove(t)}
                className="ml-0.5 opacity-60 hover:opacity-100"
                aria-label={`Remover ${t.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              disabled={saving || loading}
            >
              <Plus className="h-3 w-3 mr-0.5" /> Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar tag..." className="h-9" />
              <CommandList>
                <CommandEmpty>Nenhuma tag.</CommandEmpty>
                <CommandGroup>
                  {allTags.map((t) => {
                    const checked = !!selected.find((s) => s.id === t.id);
                    return (
                      <CommandItem
                        key={t.id}
                        onSelect={() => toggle(t)}
                        className="gap-2"
                      >
                        <span className="text-base">{t.emoji ?? "🏷️"}</span>
                        <span className="flex-1">{t.name}</span>
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ background: t.color }}
                        />
                        {checked && <Check className="h-4 w-4" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                <div className="border-t p-1">
                  <Link
                    to="/settings/tags"
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-accent"
                    onClick={() => setOpen(false)}
                  >
                    <Settings2 className="h-3 w-3" /> Gerenciar tags
                  </Link>
                </div>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
