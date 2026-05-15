import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Loader2, Plus, Search } from "lucide-react";
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
import { canonicalizePhone } from "@/lib/phone";

type Step = "phone" | "details";

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
  const [step, setStep] = useState<Step>("phone");

  // Step 1
  const [phoneRaw, setPhoneRaw] = useState("");
  const [phoneCanonical, setPhoneCanonical] = useState("");
  const [checkingContact, setCheckingContact] = useState(false);
  const [existingContact, setExistingContact] = useState<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null>(null);

  // Step 2
  const [name, setName] = useState("");
  const [dealId, setDealId] = useState("");
  const [course, setCourse] = useState("");
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<
    Array<{ id: string; display_name: string; phone_number: string | null }>
  >([]);
  const [accountId, setAccountId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data, error } = await supabase
        .from("whatsapp_accounts")
        .select("id, display_name, phone_number")
        .eq("enabled", true)
        .order("display_name");
      if (error) {
        toast.error("Erro ao carregar contas WhatsApp: " + error.message);
        return;
      }
      setAccounts(data ?? []);
      if ((data?.length ?? 0) === 1) setAccountId(data![0].id);
    })();
  }, [open]);

  function reset() {
    setStep("phone");
    setPhoneRaw("");
    setPhoneCanonical("");
    setExistingContact(null);
    setName("");
    setDealId("");
    setCourse("");
    setAccountId(accounts.length === 1 ? accounts[0].id : "");
  }

  async function continueFromPhone() {
    const canonical = canonicalizePhone(phoneRaw);
    if (!canonical || canonical.replace(/\D+/g, "").length < 10) {
      toast.error("Informe um telefone válido com DDD.");
      return;
    }
    setPhoneCanonical(canonical);
    setCheckingContact(true);
    try {
      const tail = canonical.replace(/\D+/g, "").slice(-8);
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone, email")
        .ilike("phone", `%${tail}`);
      if (error) throw error;
      const match = (data ?? []).find(
        (c) => c.phone.replace(/\D+/g, "").slice(-8) === tail,
      );
      if (match) {
        setExistingContact(match);
        setName(match.name);
        toast.success(`Contato encontrado: ${match.name}`);
      } else {
        setExistingContact(null);
        setName("");
      }
      setStep("details");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar contato";
      toast.error(msg);
    } finally {
      setCheckingContact(false);
    }
  }

  async function loadFromCrm() {
    if (!dealId.trim()) return;
    if (!accessToken) return toast.error("Sessão expirada. Faça login novamente.");
    setLoadingCrm(true);
    try {
      const r = await lookupDeal({
        data: { dealId: dealId.trim() },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.contactName && !name) setName(r.contactName);
      toast.success(`Card "${r.dealName || r.dealId}" carregado`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Card não encontrado no RD CRM";
      toast.error(msg);
    } finally {
      setLoadingCrm(false);
    }
  }

  async function findCardByPhone() {
    if (!phoneCanonical) return;
    if (!accessToken) return toast.error("Sessão expirada. Faça login novamente.");
    setLoadingCrm(true);
    try {
      const r = await findByPhone({
        data: { phone: phoneCanonical },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.dealId) {
        setDealId(r.dealId);
        toast.success("Card encontrado e vinculado");
      } else {
        toast.info("Nenhum card encontrado para esse telefone");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar card";
      toast.error(msg);
    } finally {
      setLoadingCrm(false);
    }
  }

  async function create() {
    if (!user) return;
    const n = name.trim();
    if (!n) {
      toast.error("Informe o nome do contato");
      return;
    }
    if (!accountId) {
      toast.error("Selecione a conta WhatsApp para esta conversa");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          contact_name: n,
          contact_phone: phoneCanonical,
          assigned_to: user.id,
          account_id: accountId,
          rd_deal_id: dealId.trim() || null,
          course: course.trim() || null,
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao criar conversa";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
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
            {step === "phone"
              ? "Informe o telefone do contato. Aceitamos qualquer formato."
              : existingContact
              ? "Contato existente — dados pré-preenchidos. Confira e crie a conversa."
              : "Novo contato. Preencha os dados para abrir a conversa."}
          </DialogDescription>
        </DialogHeader>

        {step === "phone" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nc-phone-step1">
                Telefone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nc-phone-step1"
                autoFocus
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !checkingContact) {
                    e.preventDefault();
                    void continueFromPhone();
                  }
                }}
                placeholder="(11) 99999-9999, 11999999999, +5511999999999..."
              />
              {phoneRaw.trim() && (
                <p className="text-[11px] text-muted-foreground">
                  Será salvo como{" "}
                  <span className="font-mono text-foreground">
                    {canonicalizePhone(phoneRaw) || "—"}
                  </span>
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={checkingContact}
              >
                Cancelar
              </Button>
              <Button
                onClick={continueFromPhone}
                disabled={!phoneRaw.trim() || checkingContact}
              >
                {checkingContact ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="size-4 mr-2" />
                )}
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex items-center justify-between">
              <div>
                <div className="text-muted-foreground">Telefone</div>
                <div className="font-mono">{phoneCanonical}</div>
              </div>
              {existingContact && (
                <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary/10 text-primary px-2 py-0.5">
                  Contato existente
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-account">Conta WhatsApp</Label>
              {accounts.length === 0 ? (
                <p className="text-[12px] text-destructive">
                  Você não tem acesso a nenhuma conta WhatsApp. Peça ao gestor para vincular um número ao seu usuário.
                </p>
              ) : (
                <select
                  id="nc-account"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.display_name}
                      {a.phone_number ? ` — ${a.phone_number}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-name">
                Nome do contato <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="João Silva"
              />
            </div>

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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={findCardByPhone}
                  disabled={loadingCrm}
                  title="Buscar card pelo telefone"
                >
                  <Search className="size-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cole o ID e clique em Carregar, ou use a lupa para buscar pelo telefone.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-course">Curso</Label>
              <Input
                id="nc-course"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="ex: Marketing Digital 2026"
              />
              <p className="text-[11px] text-muted-foreground">
                Usado para identificar o card certo no CRM quando o lead tem mais de um.
              </p>
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep("phone")}
                disabled={saving}
              >
                <ArrowLeft className="size-4 mr-2" />
                Voltar
              </Button>
              <Button onClick={create} disabled={saving}>
                {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
                Criar conversa
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
