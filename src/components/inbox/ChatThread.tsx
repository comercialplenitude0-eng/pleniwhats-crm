import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Phone, Check, CheckCheck, Loader2, Paperclip, Mic, FileText, X, Smile, Zap } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { initials, type Conversation, type Message } from "@/lib/inbox-types";
import { toast } from "sonner";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { TemplatePicker } from "./TemplatePicker";
import { TemplateVarsDialog } from "./TemplateVarsDialog";
import { applyTemplateVars, extractVars, type MessageTemplate } from "@/lib/templates";

type Props = { conversation: Conversation | null };

export function ChatThread({ conversation }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<MessageTemplate | null>(null);

  // Load templates once per user
  useEffect(() => {
    if (!user) return;
    supabase
      .from("message_templates")
      .select("*")
      .order("shortcut", { ascending: true })
      .then(({ data }) => setTemplates((data ?? []) as MessageTemplate[]));
    const ch = supabase
      .channel("message_templates:all")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_templates" }, () => {
        supabase.from("message_templates").select("*").order("shortcut").then(({ data }) =>
          setTemplates((data ?? []) as MessageTemplate[]),
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Detect leading "/word" in textarea to drive picker
  const slashMatch = useMemo(() => /^\/(\S*)$/.exec(text), [text]);
  useEffect(() => {
    if (slashMatch) {
      setPickerQuery(slashMatch[1]);
      setPickerOpen(true);
    } else {
      setPickerOpen(false);
    }
  }, [slashMatch]);

  function applyTemplate(t: MessageTemplate) {
    setPickerOpen(false);
    setText("");
    if (extractVars(t.content).length === 0) {
      const filled = applyTemplateVars(t.content, {
        nome: (conversation?.contact_name ?? "").split(" ")[0] ?? "",
      });
      setText(filled);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } else {
      setPendingTemplate(t);
    }
  }


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
    if (pickerOpen) return; // picker handles Enter/Tab/Esc/arrows
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  async function uploadAndSend(file: Blob, kind: "image" | "audio" | "document", filename: string) {
    if (!conversation || !user) return;
    setUploading(true);
    try {
      const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
      const path = `${conversation.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-media").upload(path, file, {
        contentType: (file as File).type || undefined,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(path);
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: "outbound",
        type: kind,
        content: kind === "document" ? filename : null,
        media_url: pub.publicUrl,
        sender_id: user.id,
        status: "sent",
      });
      if (error) throw error;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "document") {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast.error("Arquivo maior que 20MB");
    await uploadAndSend(f, kind, f.name);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size && recChunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) await uploadAndSend(blob, "audio", `voz-${Date.now()}.webm`);
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setRecElapsed(0);
      recTimerRef.current = setInterval(() => setRecElapsed((s) => s + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  }

  function stopRecording(cancel = false) {
    const mr = recorderRef.current;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = null;
    setRecording(false);
    if (!mr) return;
    if (cancel) {
      mr.ondataavailable = null;
      mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop());
    }
    mr.stop();
    recorderRef.current = null;
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
                  {m.type === "image" && m.media_url && (
                    <a href={m.media_url} target="_blank" rel="noreferrer" className="block -mx-1 -mt-1 mb-1">
                      <img src={m.media_url} alt="" className="rounded-lg max-h-72 object-cover" />
                    </a>
                  )}
                  {m.type === "audio" && m.media_url && (
                    <audio controls src={m.media_url} className="max-w-full" />
                  )}
                  {m.type === "document" && m.media_url && (
                    <a
                      href={m.media_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 underline underline-offset-2"
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">{m.content ?? "Documento"}</span>
                    </a>
                  )}
                  {m.type === "text" && m.content && (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70">
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

      <div className="p-3 border-t bg-[var(--color-chat-panel)]">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPickFile(e, "image")}
        />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => onPickFile(e, "document")}
        />

        {recording ? (
          <div className="flex items-center gap-3 max-w-3xl mx-auto">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 text-destructive">
              <span className="size-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm font-medium">Gravando… {String(Math.floor(recElapsed / 60)).padStart(2, "0")}:{String(recElapsed % 60).padStart(2, "0")}</span>
            </div>
            <Button variant="ghost" size="icon" className="size-10" onClick={() => stopRecording(true)} aria-label="Cancelar">
              <X className="size-4" />
            </Button>
            <Button size="icon" className="size-10" onClick={() => stopRecording(false)} aria-label="Enviar áudio">
              <Send className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              aria-label="Enviar imagem"
              title="Enviar imagem"
            >
              <Paperclip className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Enviar arquivo"
              title="Enviar arquivo"
            >
              <FileText className="size-4" />
            </Button>
            <TemplatePicker
              open={pickerOpen}
              templates={templates}
              query={pickerQuery}
              onSelect={applyTemplate}
              onOpenChange={setPickerOpen}
              anchor={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0"
                  disabled={uploading}
                  aria-label="Respostas rápidas"
                  title="Respostas rápidas (digite /)"
                  onClick={() => {
                    setPickerQuery("");
                    setPickerOpen((o) => !o);
                  }}
                >
                  <Zap className="size-4" />
                </Button>
              }
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10 shrink-0"
                  disabled={uploading}
                  aria-label="Inserir emoji"
                  title="Inserir emoji"
                >
                  <Smile className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="p-0 border-0 bg-transparent shadow-none w-auto">
                <EmojiPicker
                  onEmojiClick={(d) => setText((t) => t + d.emoji)}
                  emojiStyle={EmojiStyle.NATIVE}
                  theme={Theme.AUTO}
                  width={320}
                  height={380}
                  searchPlaceHolder="Buscar emoji"
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis
                />
              </PopoverContent>
            </Popover>
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={uploading ? "Enviando arquivo..." : "Digite uma mensagem... (use / para respostas rápidas)"}
              rows={1}
              disabled={uploading}
              className="resize-none min-h-10 max-h-32 bg-background"
            />
            {text.trim() ? (
              <Button onClick={send} disabled={sending} size="icon" className="size-10 shrink-0">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            ) : (
              <Button
                onClick={startRecording}
                disabled={uploading}
                size="icon"
                className="size-10 shrink-0"
                aria-label="Gravar áudio"
                title="Gravar áudio"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
              </Button>
            )}
          </div>
        )}
      </div>
      <TemplateVarsDialog
        template={pendingTemplate}
        contactName={conversation?.contact_name}
        onClose={() => setPendingTemplate(null)}
        onConfirm={(filled) => {
          setPendingTemplate(null);
          setText(filled);
          requestAnimationFrame(() => textareaRef.current?.focus());
        }}
      />
    </div>
  );
}
