import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatThread } from "@/components/inbox/ChatThread";
import { CrmPanel } from "@/components/inbox/CrmPanel";
import type { Conversation } from "@/lib/inbox-types";

export const Route = createFileRoute("/_authenticated/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false });
    setConversations(data ?? []);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("conversations:all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => { void load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  // mark as read when opening
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
        onSeeded={load}
      />
      <ChatThread conversation={selected} />
      <CrmPanel
        conversation={selected}
        onUpdated={(c) => {
          setConversations((prev) => prev.map((x) => (x.id === c.id ? c : x)));
        }}
      />
    </div>
  );
}
