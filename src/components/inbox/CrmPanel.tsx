import { useEffect, useState } from "react";
import { Phone, Plus, X, Save, Loader2, Send, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  LABEL_META,
  STATUS_LABEL,
  initials,
  type Conversation,
  type ConvLabel,
  type ConvStatus,
} from "@/lib/inbox-types";
import { toast } from "sonner";
import { RdCrmSection } from "./RdCrmSection";

type Props = {
  conversation: Conversation | null;
  onUpdated: (c: Conversation) => void;
};

type Note = {
  id: string;
  conversation_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type Activity = {
  id: string;
  conversation_id: string;
  user_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type ProfileLite = { id: string; name: string };

export function CrmPanel({ conversation, onUpdated }: Props) {
  const { user } = useAuth();
  const [crm, setCrm] = useState<Record<string, string>>({});
  const [label, setLabel] = useState<ConvLabel>("new");
  const [status, setStatus] = useState<ConvStatus>("aguardando");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [postingNote, setPostingNote] = useState(false);

  useEffect(() => {
    if (!conversation) return;
    setCrm((conversation.crm_data as Record<string, string>) ?? {});
    setLabel(conversation.label);
    setStatus(conversation.status);
  }, [conversation?.id]);

  // Load profiles once for activity/notes labelling
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id,name")
      .then(({ data }) => {
        const map: Record<string, string> = {};
        (data ?? []).forEach((p: ProfileLite) => (map[p.id] = p.name));
        setProfilesById(map);
      });
  }, []);

  // Notes & activity loaders + realtime
  useEffect(() => {
    if (!conversation) {
      setNotes([]);
      setActivity([]);
      return;
    }
    const cid = conversation.id;
    let cancelled = false;

    Promise.all([
      supabase
        .from("conversation_notes")
        .select("*")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: false }),
      supabase
        .from("conversation_activity")
        .select("*")
        .eq("conversation_id", cid)
        .order("created_at", { ascending: false })
        .limit(100),
    ]).then(([n, a]) => {
      if (cancelled) return;
      setNotes((n.data ?? []) as Note[]);
      setActivity((a.data ?? []) as Activity[]);
    });

    const ch = supabase
      .channel(`crm:${cid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_notes",
          filter: `conversation_id=eq.${cid}`,
        },
        () => {
          supabase
            .from("conversation_notes")
            .select("*")
            .eq("conversation_id", cid)
            .order("created_at", { ascending: false })
            .then(({ data }) => setNotes((data ?? []) as Note[]));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_activity",
          filter: `conversation_id=eq.${cid}`,
        },
        (payload) => {
          setActivity((prev) => [payload.new as Activity, ...prev]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [conversation?.id]);

  if (!conversation) {
    return <aside className="w-[340px] border-l bg-sidebar shrink-0 hidden xl:block" aria-hidden />;
  }

  async function save() {
    if (!conversation) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("conversations")
      .update({ crm_data: crm, label, status })
      .eq("id", conversation.id)
      .select("*")
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lead atualizado");
    if (data) onUpdated(data);
  }

  function addField() {
    const k = newKey.trim();
    if (!k || crm[k] !== undefined) return;
    setCrm({ ...crm, [k]: "" });
    setNewKey("");
  }

  async function postNote() {
    if (!conversation || !user) return;
    const body = noteDraft.trim();
    if (!body) return;
    setPostingNote(true);
    const { error } = await supabase.from("conversation_notes").insert({
      conversation_id: conversation.id,
      user_id: user.id,
      body,
    });
    setPostingNote(false);
    if (error) return toast.error(error.message);
    setNoteDraft("");
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from("conversation_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
  }

  return (
    <aside className="w-[340px] border-l bg-sidebar shrink-0 hidden xl:flex flex-col">
      <div className="p-5 pb-3 text-center border-b">
        <Avatar className="size-16 mx-auto">
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
            {initials(conversation.contact_name)}
          </AvatarFallback>
        </Avatar>
        <h3 className="mt-2 font-semibold">{conversation.contact_name}</h3>
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5 mt-0.5">
          <Phone className="size-3" /> {conversation.contact_phone}
        </p>
      </div>

      <Tabs defaultValue="lead" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-3 grid grid-cols-4">
          <TabsTrigger value="lead">Lead</TabsTrigger>
          <TabsTrigger value="rd">RD CRM</TabsTrigger>
          <TabsTrigger value="notes">
            Notas{notes.length > 0 && <span className="ml-1 opacity-60">({notes.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="activity">Hist.</TabsTrigger>
        </TabsList>

        {/* LEAD TAB */}
        <TabsContent value="lead" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground tracking-wide">
                    Etiqueta
                  </Label>
                  <Select value={label} onValueChange={(v) => setLabel(v as ConvLabel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LABEL_META).map(([k, m]) => (
                        <SelectItem key={k} value={k}>
                          {m.emoji} {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground tracking-wide">
                    Status
                  </Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ConvStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([k, name]) => (
                        <SelectItem key={k} value={k}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground tracking-wide">
                  Dados do lead
                </Label>
                <div className="mt-2 space-y-2">
                  {Object.keys(crm).length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      Nenhum campo. Adicione abaixo.
                    </p>
                  )}
                  {Object.entries(crm).map(([k, v]) => (
                    <div key={k} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{k}</span>
                        <button
                          onClick={() => {
                            const c = { ...crm };
                            delete c[k];
                            setCrm(c);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                      <Input
                        value={v ?? ""}
                        onChange={(e) => setCrm({ ...crm, [k]: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Novo campo (ex: curso)"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addField();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="size-8"
                    onClick={addField}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>

              <Button onClick={save} disabled={saving} className={cn("w-full")}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Save className="size-4 mr-2" />
                )}
                Salvar alterações
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* NOTES TAB */}
        {/* RD CRM TAB */}
        <TabsContent value="rd" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <RdCrmSection
                conversation={conversation}
                onLinked={(dealId) => onUpdated({ ...conversation, rd_deal_id: dealId })}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="notes" className="flex-1 min-h-0 m-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  Nenhuma nota interna ainda.
                </p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="rounded-lg border bg-background p-3 group">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[10px] bg-secondary">
                            {initials(profilesById[n.user_id] ?? "?")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium truncate">
                          {profilesById[n.user_id] ?? "—"}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(n.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {n.user_id === user?.id && (
                        <button
                          onClick={() => deleteNote(n.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                          aria-label="Excluir nota"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{n.body}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="border-t p-3 space-y-2 bg-background/50">
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Adicione uma nota interna…"
              rows={3}
              className="resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void postNote();
                }
              }}
            />
            <Button
              onClick={postNote}
              disabled={postingNote || !noteDraft.trim()}
              size="sm"
              className="w-full"
            >
              {postingNote ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Send className="size-4 mr-2" />
              )}
              Salvar nota
            </Button>
          </div>
        </TabsContent>

        {/* ACTIVITY TAB */}
        <TabsContent value="activity" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  Nenhuma alteração registrada ainda.
                </p>
              ) : (
                <ul className="relative space-y-3 before:absolute before:left-[11px] before:top-1 before:bottom-1 before:w-px before:bg-border">
                  {activity.map((a) => (
                    <li key={a.id} className="relative pl-7">
                      <span className="absolute left-1.5 top-1.5 size-2.5 rounded-full bg-primary ring-2 ring-sidebar" />
                      <div className="text-xs">
                        <span className="font-medium">
                          {a.user_id ? profilesById[a.user_id] ?? "Sistema" : "Sistema"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {describeActivity(a, profilesById)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(a.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function describeActivity(a: Activity, profiles: Record<string, string>): string {
  const p = a.payload as Record<string, unknown>;
  switch (a.kind) {
    case "label_changed": {
      const from = LABEL_META[p.from as ConvLabel]?.name ?? p.from;
      const to = LABEL_META[p.to as ConvLabel]?.name ?? p.to;
      return `mudou a etiqueta de ${from} para ${to}`;
    }
    case "status_changed": {
      const from = STATUS_LABEL[p.from as ConvStatus] ?? p.from;
      const to = STATUS_LABEL[p.to as ConvStatus] ?? p.to;
      return `mudou o status de ${from} para ${to}`;
    }
    case "assigned_changed": {
      const fromName = p.from ? profiles[p.from as string] ?? "alguém" : "ninguém";
      const toName = p.to ? profiles[p.to as string] ?? "alguém" : "ninguém";
      return `transferiu a conversa de ${fromName} para ${toName}`;
    }
    case "note_created":
      return `adicionou uma nota: "${(p.preview as string) ?? ""}"`;
    default:
      return a.kind;
  }
}
