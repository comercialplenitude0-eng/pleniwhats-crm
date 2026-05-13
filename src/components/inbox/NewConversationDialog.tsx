import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { getRdDealContact, findRdDealByPhone } from "@/lib/rd-crm.functions";

export function NewConversationDialog({
  onCreated,
}: {
  onCreated: (id: string) => void;
}) {
  const { user, session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const lookupDeal = useServerFn(getRdDealContact);
  const findByPhone = useServerFn(findRdDealByPhone);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dealId, setDealId] = useState("");
  const [course, setCourse] = useState("");
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPhone("");
    setDealId("");
  }

  async function loadFromCrm() {
    if (!dealId.trim()) return;
    if (!accessToken) return toast.error("Sessão expirada. Faça login novamente para carregar o card.");
    setLoadingCrm(true);
    try {
      const r = await lookupDeal({
        data: { dealId: dealId.trim() },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.contactName && !name) setName(r.contactName);
      if (r.contactPhone && !phone) setPhone(r.contactPhone);
      toast.success(`Card "${r.dealName || r.dealId}" carregado`);
    } catch (e: any) {
      toast.error(e?.message ?? "Card não encontrado no RD CRM");
    } finally {
      setLoadingCrm(false);
    }
  }

  async function findCardByPhone() {
    if (!phone.trim()) return;
    if (!accessToken) return toast.error("Sessão expirada. Faça login novamente para buscar o card.");
    setLoadingCrm(true);
    try {
      const r = await findByPhone({
        data: { phone: phone.trim() },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.dealId) {
        setDealId(r.dealId);
        toast.success("Card encontrado e vinculado");
      } else {
        toast.info("Nenhum card encontrado para esse telefone");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao buscar card");
    } finally {
      setLoadingCrm(false);
    }
  }

  async function create() {
    if (!user) return;
    const n = name.trim();
    const p = phone.trim();
    if (!n || !p) {
      toast.error("Informe nome e telefone");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          contact_name: n,
          contact_phone: p,
          assigned_to: user.id,
          rd_deal_id: dealId.trim() || null,
          last_message: null,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Conversa criada");
      onCreated(data.id);
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar conversa");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default" className="gap-1.5">
          <Plus className="size-4" />
          Nova conversa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
          <DialogDescription>
            Inicie uma conversa de teste — opcionalmente vinculada a um card do RD CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nc-deal">ID do card no RD CRM (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="nc-deal"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                placeholder="ex: 6710abc..."
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={loadFromCrm}
                disabled={!dealId.trim() || loadingCrm}
              >
                {loadingCrm ? <Loader2 className="size-4 animate-spin" /> : "Carregar"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cole o ID e clique em Carregar para preencher nome e telefone do contato.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-name">Nome do contato</Label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="João Silva"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-phone">Telefone (com DDI/DDD)</Label>
            <div className="flex gap-2">
              <Input
                id="nc-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5511999999999"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={findCardByPhone}
                disabled={!phone.trim() || loadingCrm}
                title="Buscar card pelo telefone"
              >
                <Search className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={saving}>
            {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
            Criar conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
