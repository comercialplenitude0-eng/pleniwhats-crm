import { useEffect, useRef, useState } from "react";
import { Send, Phone, Check, CheckCheck, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { initials, type Conversation, type Message } from "@/lib/inbox-types";
import { toast } from "sonner";

type Props = { conversation: Conversation | null };

export function ChatThread({ conversation }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // load + realtime
  useEffect(() => {
    if (!conversation) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setMessages(data ?? []);
        setLoading(false);
      });

    const ch = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as Message).id) ? prev : [...prev, payload.new as Message]
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [conversation?.id]);

  // autoscroll on new message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    if (!conversation || !text.trim() || !user) return;
    const content = text.trim();
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      type: "text",
      content,
      sender_id: user.id,
      status: "sent",
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  if (!conversation) {
    return (
      <div className="flex-1 grid place-items-center bg-[var(--color-chat-bg)]">
        <div className="text-center text-muted-foreground">
          <p className="text-lg">Selecione uma conversa para começar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-chat-bg)] min-w-0">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-[var(--color-chat-panel)]">
        <Avatar className="size-10">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            {initials(conversation.contact_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{conversation.contact_name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="size-3" /> {conversation.contact_phone}
          </div>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef as never}>
        <div className="px-4 sm:px-8 py-6 space-y-2 max-w-3xl mx-auto">
          {loading && (
            <div className="grid place-items-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {messages.map((m) => {
            const out = m.direction === "outbound";
            return (
              <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                    out
                      ? "bg-[var(--color-bubble-out)] text-[var(--color-bubble-out-foreground)] rounded-br-md"
                      : "bg-[var(--color-bubble-in)] text-[var(--color-bubble-in-foreground)] rounded-bl-md"
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70")}>
                    <span>{new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    {out && (m.status === "read"
                      ? <CheckCheck className="size-3 text-primary" />
                      : m.status === "delivered"
                        ? <CheckCheck className="size-3" />
                        : <Check className="size-3" />)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="p-3 border-t bg-[var(--color-chat-panel)]">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Digite uma mensagem..."
            rows={1}
            className="resize-none min-h-10 max-h-32 bg-background"
          />
          <Button onClick={send} disabled={sending || !text.trim()} size="icon" className="size-10 shrink-0">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
