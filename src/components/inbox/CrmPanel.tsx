import { useEffect, useState } from "react";
import { Phone, Plus, X, Save, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { LABEL_META, STATUS_LABEL, initials, type Conversation, type ConvLabel, type ConvStatus } from "@/lib/inbox-types";
import { toast } from "sonner";

type Props = { conversation: Conversation | null; onUpdated: (c: Conversation) => void };

export function CrmPanel({ conversation, onUpdated }: Props) {
  const [crm, setCrm] = useState<Record<string, string>>({});
  const [label, setLabel] = useState<ConvLabel>("new");
  const [status, setStatus] = useState<ConvStatus>("aguardando");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!conversation) return;
    setCrm((conversation.crm_data as Record<string, string>) ?? {});
    setLabel(conversation.label);
    setStatus(conversation.status);
  }, [conversation?.id]);

  if (!conversation) {
    return <aside className="w-[340px] border-l bg-sidebar shrink-0 hidden xl:block" />;
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
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lead atualizado");
    if (data) onUpdated(data);
  }

  function addField() {
    const k = newKey.trim();
    if (!k) return;
    if (crm[k] !== undefined) return;
    setCrm({ ...crm, [k]: "" });
    setNewKey("");
  }

  return (
    <aside className="w-[340px] border-l bg-sidebar shrink-0 hidden xl:flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-6">
          {/* Contact head */}
          <div className="text-center">
            <Avatar className="size-20 mx-auto">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {initials(conversation.contact_name)}
              </AvatarFallback>
            </Avatar>
            <h3 className="mt-3 font-semibold text-lg">{conversation.contact_name}</h3>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5 mt-0.5">
              <Phone className="size-3" /> {conversation.contact_phone}
            </p>
          </div>

          {/* Label + status */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground tracking-wide">Etiqueta</Label>
              <Select value={label} onValueChange={(v) => setLabel(v as ConvLabel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LABEL_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.emoji} {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground tracking-wide">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ConvStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, name]) => (
                    <SelectItem key={k} value={k}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* CRM fields */}
          <div>
            <Label className="text-xs uppercase text-muted-foreground tracking-wide">Dados do lead</Label>
            <div className="mt-2 space-y-2">
              {Object.keys(crm).length === 0 && (
                <p className="text-sm text-muted-foreground italic">Nenhum campo. Adicione abaixo.</p>
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
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField(); } }}
              />
              <Button size="icon" variant="secondary" className="size-8" onClick={addField}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <Button onClick={save} disabled={saving} className={cn("w-full")}>
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Salvar alterações
          </Button>
        </div>
      </ScrollArea>
    </aside>
  );
}
