import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isManagerRole } from "@/lib/auth";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatThread } from "@/components/inbox/ChatThread";
import { CrmPanel } from "@/components/inbox/CrmPanel";
import type { Conversation } from "@/lib/inbox-types";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

const PAGE_SIZE = 50;

function InboxPage() {
  const { profile, role } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega página inicial (mais recentes)
  const loadInitial = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(PAGE_SIZE);
    const list = (data ?? []) as Conversation[];
    setConversations(list);
    setHasMore(list.length === PAGE_SIZE);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const last = conversations[conversations.length - 1];
    const cursor = last?.last_message_at ?? new Date().toISOString();
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .lt("last_message_at", cursor)
      .order("last_message_at", { ascending: false })
      .limit(PAGE_SIZE);
    const list = (data ?? []) as Conversation[];
    setConversations((prev) => [...prev, ...list]);
    setHasMore(list.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [conversations, hasMore, loadingMore]);

  // Debounced refetch para INSERT (única operação que precisa buscar dado novo)
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      void loadInitial();
    }, 300);
  }, [loadInitial]);

  useEffect(() => {
    void loadInitial();
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, [loadInitial]);

  // Realtime: patch incremental (UPDATE/DELETE) + refetch debounced (INSERT)
  useEffect(() => {
    if (!profile?.id) return;
    const isMgr = isManagerRole(role);
    const channel = supabase.channel(`conversations:${profile.id}`);

    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "conversations" },
      (payload) => {
        const next = payload.new as Conversation;
        // Vendedor: ignora updates fora do seu escopo
        if (!isMgr && next.assigned_to && next.assigned_to !== profile.id) return;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === next.id);
          if (idx === -1) {
            // Conversa nova pra mim (ex.: recém atribuída) — refetch
            scheduleRefetch();
            return prev;
          }
          // Patch + reordena por last_message_at (em geral só sobe)
          const merged = [...prev];
          merged[idx] = { ...merged[idx], ...next };
          merged.sort(
            (a, b) =>
              new Date(b.last_message_at).getTime() -
              new Date(a.last_message_at).getTime(),
          );
          return merged;
        });
      },
    );

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "conversations" },
      () => scheduleRefetch(),
    );

    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "conversations" },
      (payload) => {
        const old = payload.old as Conversation;
        setConversations((prev) => prev.filter((c) => c.id !== old.id));
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, role, scheduleRefetch]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Marca como lida ao abrir
  useEffect(() => {
    if (!selected || selected.unread_count === 0) return;
    void supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", selected.id);
  }, [selected?.id]);

  return (
    <div className="flex-1 flex bg-background min-w-0">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSeeded={loadInitial}
        onLoadMore={loadMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
      />
      <ChatThread
        conversation={selected}
        onBack={() => setSelectedId(null)}
      />
      <CrmPanel
        conversation={selected}
        onUpdated={(c) => {
          setConversations((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        }}
      />
    </div>
  );
}
