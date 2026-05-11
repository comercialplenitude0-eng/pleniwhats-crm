import { useEffect, useState } from "react";
import { Search, MessageCircle, LogOut, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { LABEL_META, type Conversation, formatTime, initials } from "@/lib/inbox-types";
import { seedDemoConversationsForCurrentUser } from "@/lib/seed";
import { toast } from "sonner";

type Props = {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
};

export function ConversationList({ conversations, selectedId, onSelect, onSeeded }: Props) {
  const { profile, role, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [seeding, setSeeding] = useState(false);

  const filtered = conversations.filter((c) =>
    c.contact_name.toLowerCase().includes(query.toLowerCase())
    || c.contact_phone.includes(query)
  );

  useEffect(() => {
    // pre-select first
    if (!selectedId && filtered[0]) onSelect(filtered[0].id);
  }, [filtered, selectedId, onSelect]);

  async function seed() {
    setSeeding(true);
    const n = await seedDemoConversationsForCurrentUser();
    setSeeding(false);
    if (n > 0) {
      toast.success(`${n} conversas de demonstração criadas`);
      onSeeded();
    } else {
      toast.info("Você já tem conversas — nada a criar.");
    }
  }

  return (
    <aside className="flex flex-col w-[340px] border-r bg-sidebar shrink-0">
      {/* User header */}
      <div className="flex items-center gap-3 p-3 border-b">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
            {initials(profile?.name ?? "?")}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{profile?.name ?? "—"}</div>
          <div className="text-xs text-muted-foreground capitalize">{role}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
          <LogOut className="size-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-9 bg-background"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="p-6 text-center space-y-4">
            <div className="size-12 rounded-2xl bg-accent grid place-items-center mx-auto">
              <MessageCircle className="size-6 text-primary" />
            </div>
            <div>
              <p className="font-medium">Nenhuma conversa ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Crie 3 conversas de demonstração para explorar a plataforma.
              </p>
            </div>
            <Button onClick={seed} disabled={seeding} variant="default" className="w-full">
              <Sparkles className="size-4 mr-2" />
              {seeding ? "Criando..." : "Gerar dados de demo"}
            </Button>
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((c) => {
              const meta = LABEL_META[c.label];
              const active = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "w-full flex items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/40",
                      active && "bg-accent"
                    )}
                  >
                    <Avatar className="size-11 shrink-0">
                      <AvatarFallback className="bg-secondary text-secondary-foreground font-medium">
                        {initials(c.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{c.contact_name}</span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatTime(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground truncate">
                          {c.last_message ?? "—"}
                        </span>
                        {c.unread_count > 0 && (
                          <Badge className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px]">
                            {c.unread_count}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border", meta.className)}>
                          <span>{meta.emoji}</span>{meta.name}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}
