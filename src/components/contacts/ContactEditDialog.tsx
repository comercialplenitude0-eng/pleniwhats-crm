import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getContact, getContactByPhone, upsertContact } from "@/lib/contacts.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Provide one of these to load the existing contact */
  contactId?: string | null;
  contactPhone?: string | null;
  /** Initial name when creating */
  initialName?: string;
  onSaved?: (id: string) => void;
};

type Form = {
  id: string | null;
  phone: string;
  name: string;
  email: string;
  avatar_url: string;
  notes: string;
};

const empty = (): Form => ({
  id: null,
  phone: "",
  name: "",
  email: "",
  avatar_url: "",
  notes: "",
});

export function ContactEditDialog({
  open, onOpenChange, contactId, contactPhone, initialName, onSaved,
}: Props) {
  const fetchById = useServerFn(getContact);
  const fetchByPhone = useServerFn(getContactByPhone);
  const saveFn = useServerFn(upsertContact);

  const [form, setForm] = useState<Form>(empty());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let row: any = null;
        if (contactId) {
          row = await fetchById({ data: { id: contactId } });
        } else if (contactPhone) {
          row = await fetchByPhone({ data: { phone: contactPhone } });
        }
        if (cancelled) return;
        if (row) {
          setForm({
            id: row.id,
            phone: row.phone ?? "",
            name: row.name ?? "",
            email: row.email ?? "",
            avatar_url: row.avatar_url ?? "",
            notes: row.notes ?? "",
          });
        } else {
          setForm({
            ...empty(),
            phone: contactPhone ?? "",
            name: initialName ?? "",
          });
        }
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, contactId, contactPhone]);

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Nome e telefone são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const r = await saveFn({
        data: {
          id: form.id ?? undefined,
          phone: form.phone.trim(),
          name: form.name.trim(),
          email: form.email.trim() || null,
          avatar_url: form.avatar_url.trim() || null,
          notes: form.notes.trim() || null,
        },
      });
      toast.success("Contato salvo");
      onSaved?.(r.id);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar contato" : "Novo contato"}</DialogTitle>
          <DialogDescription>
            Mudanças no nome e avatar refletem em todas as conversas deste contato.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nome</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Telefone</Label>
              <Input
                id="c-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={40}
                disabled={!!form.id}
              />
              {form.id && (
                <p className="text-[11px] text-muted-foreground">
                  Telefone não pode ser alterado após criação.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">E-mail</Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-avatar">URL do avatar</Label>
              <Input id="c-avatar" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notas internas</Label>
              <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
