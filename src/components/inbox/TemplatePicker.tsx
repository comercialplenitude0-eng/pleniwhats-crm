import { useEffect, useMemo, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MessageTemplate } from "@/lib/templates";

type Props = {
  open: boolean;
  templates: MessageTemplate[];
  query: string;
  onSelect: (t: MessageTemplate) => void;
  onOpenChange: (open: boolean) => void;
  anchor: React.ReactNode;
};

export function TemplatePicker({ open, templates, query, onSelect, onOpenChange, anchor }: Props) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates.slice(0, 20);
    return templates
      .filter(
        (t) =>
          t.shortcut.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.content.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [templates, query]);

  const [highlight, setHighlight] = useState(0);
  useEffect(() => setHighlight(0), [query, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (filtered[highlight]) {
          e.preventDefault();
          onSelect(filtered[highlight]);
        }
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, filtered, highlight, onSelect, onOpenChange]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{anchor}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="p-0 w-[360px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandInput value={query} readOnly placeholder="Digite /atalho" />
          <CommandList>
            <CommandEmpty>Nenhum template</CommandEmpty>
            <CommandGroup heading="Respostas rápidas">
              {filtered.map((t, i) => (
                <CommandItem
                  key={t.id}
                  onSelect={() => onSelect(t)}
                  className={i === highlight ? "bg-accent" : ""}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-primary">/{t.shortcut}</span>
                      <span className="text-sm font-medium truncate">{t.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{t.content}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
