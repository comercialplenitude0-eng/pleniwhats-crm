import { useEffect, useMemo, useState } from "react";
import {
  Search,
  MessageCircle,
  LogOut,
  Sparkles,
  SlidersHorizontal,
  X,
  Check,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth, isManagerRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  LABEL_META,
  STATUS_LABEL,
  type Conversation,
  type ConvLabel,
  type ConvStatus,
  formatTime,
  initials,
} from "@/lib/inbox-types";
import { seedDemoConversationsForCurrentUser } from "@/lib/seed";
import { NewConversationDialog } from "./NewConversationDialog";
import { toast } from "sonner";

type Props = {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
};

type Profile = { id: string; name: string };
type AccountOpt = { id: string; display_name: string };

const LABEL_KEYS = Object.keys(LABEL_META) as ConvLabel[];
const STATUS_KEYS = Object.keys(STATUS_LABEL) as ConvStatus[];

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onSeeded,
  onLoadMore,
  hasMore,
  loadingMore,
}: Props) {
  const { profile, role, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 300);
  const [seeding, setSeeding] = useState(false);

  // Filters
  const [labels, setLabels] = useState<Set<ConvLabel>>(new Set());
  const [statuses, setStatuses] = useState<Set<ConvStatus>>(new Set());
  const [assignee, setAssignee] = useState<"all" | "me" | "unassigned" | string>(
    "all",
  );
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [accountIds, setAccountIds] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [messageMatchIds, setMessageMatchIds] = useState<Set<string> | null>(
    null,
  );
  const [searchingMessages, setSearchingMessages] = useState(false);

  // Load profiles for assignee filter (gestor only)
  useEffect(() => {
    if (!isManagerRole(role)) return;
    supabase
      .from("profiles")
      .select("id,name")
      .order("name")
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, [role]);

  // Load accessible WhatsApp accounts (RLS filters automatically)
  useEffect(() => {
    supabase
      .from("whatsapp_accounts")
      .select("id,display_name")
      .eq("enabled", true)
      .order("display_name")
      .then(({ data }) => setAccounts((data ?? []) as AccountOpt[]));
  }, []);

  // Search inside message content (debounced)
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setMessageMatchIds(null);
      return;
    }
    let cancelled = false;
    setSearchingMessages(true);
    supabase
      .from("messages")
      .select("conversation_id")
      .ilike("content", `%${q}%`)
      .limit(500)
      .then(({ data }) => {
        if (cancelled) return;
        setMessageMatchIds(
          new Set((data ?? []).map((m) => m.conversation_id as string)),
        );
        setSearchingMessages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const activeFilterCount =
    labels.size +
    statuses.size +
    accountIds.size +
    (assignee !== "all" ? 1 : 0) +
    (unreadOnly ? 1 : 0);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (labels.size && !labels.has(c.label)) return false;
      if (statuses.size && !statuses.has(c.status)) return false;
      if (accountIds.size && !(c.account_id && accountIds.has(c.account_id))) return false;
      if (unreadOnly && c.unread_count === 0) return false;
      if (assignee === "me" && c.assigned_to !== profile?.id) return false;
      if (assignee === "unassigned" && c.assigned_to !== null) return false;
      if (
        assignee !== "all" &&
        assignee !== "me" &&
        assignee !== "unassigned" &&
        c.assigned_to !== assignee
      )
        return false;
      if (!q) return true;
      const hitName = c.contact_name.toLowerCase().includes(q);
      const hitPhone = c.contact_phone.includes(debouncedQuery.trim());
      const hitLast = (c.last_message ?? "").toLowerCase().includes(q);
      const hitMsg = messageMatchIds?.has(c.id) ?? false;
      return hitName || hitPhone || hitLast || hitMsg;
    });
  }, [
    conversations,
    debouncedQuery,
    labels,
    statuses,
    accountIds,
    assignee,
    unreadOnly,
    messageMatchIds,
    profile?.id,
  ]);

  useEffect(() => {
    if (!selectedId && filtered[0]) onSelect(filtered[0].id);
  }, [filtered, selectedId, onSelect]);

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function clearFilters() {
    setLabels(new Set());
    setStatuses(new Set());
    setAccountIds(new Set());
    setAssignee("all");
    setUnreadOnly(false);
  }

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
    <aside
      className={cn(
        "flex-col bg-sidebar border-r md:w-[340px] md:shrink-0 md:flex w-full",
        selectedId ? "hidden" : "flex flex-1"
      )}
    >
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
        <NewConversationDialog onCreated={(id) => { onSeeded(); onSelect(id); }} />
        <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
          <LogOut className="size-4" />
        </Button>
      </div>

      {/* Search + filters */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nome, telefone, mensagem…"
              className="pl-9 pr-8 bg-background"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative shrink-0 bg-background"
                aria-label="Filtros"
                title="Filtros"
              >
                <SlidersHorizontal className="size-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Etiqueta
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {LABEL_KEYS.map((k) => {
                    const m = LABEL_META[k];
                    const on = labels.has(k);
                    return (
                      <button
                        key={k}
                        onClick={() => setLabels((s) => toggleSet(s, k))}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors",
                          on ? m.className : "bg-background hover:bg-accent",
                        )}
                      >
                        {on && <Check className="size-3" />}
                        <span>{m.emoji}</span>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Status
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_KEYS.map((k) => {
                    const on = statuses.has(k);
                    return (
                      <button
                        key={k}
                        onClick={() => setStatuses((s) => toggleSet(s, k))}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors",
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-accent",
                        )}
                      >
                        {on && <Check className="size-3" />}
                        {STATUS_LABEL[k]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {accounts.length > 1 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Conta WhatsApp
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {accounts.map((a) => {
                      const on = accountIds.has(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setAccountIds((s) => toggleSet(s, a.id))}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors",
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-accent",
                          )}
                        >
                          {on && <Check className="size-3" />}
                          {a.display_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isManagerRole(role) && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Responsável
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { v: "all", label: "Todos" },
                      { v: "me", label: "Eu" },
                      { v: "unassigned", label: "Sem responsável" },
                    ].map((o) => {
                      const on = assignee === o.v;
                      return (
                        <button
                          key={o.v}
                          onClick={() => setAssignee(o.v)}
                          className={cn(
                            "text-xs px-2 py-1 rounded border transition-colors",
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-accent",
                          )}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                    {profiles
                      .filter((p) => p.id !== profile?.id)
                      .map((p) => {
                        const on = assignee === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setAssignee(p.id)}
                            className={cn(
                              "text-xs px-2 py-1 rounded border transition-colors",
                              on
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background hover:bg-accent",
                            )}
                          >
                            {p.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <Label htmlFor="unreadOnly" className="text-sm">
                  Apenas não lidas
                </Label>
                <Switch
                  id="unreadOnly"
                  checked={unreadOnly}
                  onCheckedChange={setUnreadOnly}
                />
              </div>

              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearFilters}
                >
                  Limpar filtros
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {(activeFilterCount > 0 || debouncedQuery) && (
          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span>
              {filtered.length}{" "}
              {filtered.length === 1 ? "resultado" : "resultados"}
              {searchingMessages && " · buscando…"}
            </span>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-primary hover:underline"
              >
                Limpar
              </button>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          conversations.length === 0 ? (
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
              <Button
                onClick={seed}
                disabled={seeding}
                variant="default"
                className="w-full"
              >
                <Sparkles className="size-4 mr-2" />
                {seeding ? "Criando..." : "Gerar dados de demo"}
              </Button>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum resultado para sua busca.
            </div>
          )
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
                      active && "bg-accent",
                    )}
                  >
                    <Avatar className="size-11 shrink-0">
                      <AvatarFallback className="bg-secondary text-secondary-foreground font-medium">
                        {initials(c.contact_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">
                          {c.contact_name}
                        </span>
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
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                            meta.className,
                          )}
                        >
                          <span>{meta.emoji}</span>
                          {meta.name}
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
