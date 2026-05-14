import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isManagerRole, type AppRole } from "@/lib/auth";
import {
  listWhatsappAccounts,
  getAllUserAccess,
  setUserAccountAccess,
} from "@/lib/whatsapp-accounts.functions";
import { reassignAll, removeMember } from "@/lib/team.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Settings as SettingsIcon, Clock, Users, Crown, Save, MessageCircle, ChevronRight, Phone, ArrowRightLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Settings = {
  id: string;
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  timezone: string;
  away_message: string;
  away_message_enabled: boolean;
};

type Member = { id: string; name: string; email: string; isGestor: boolean; convCount: number };

const DAYS = [
  { v: 0, label: "Dom" }, { v: 1, label: "Seg" }, { v: 2, label: "Ter" },
  { v: 3, label: "Qua" }, { v: 4, label: "Qui" }, { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
];

type AccountLite = { id: string; display_name: string; phone_number: string | null; enabled: boolean };

function SettingsPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const fetchAccounts = useServerFn(listWhatsappAccounts);
  const fetchAccess = useServerFn(getAllUserAccess);
  const setAccessFn = useServerFn(setUserAccountAccess);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [accessMap, setAccessMap] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (role && !isManagerRole(role)) navigate({ to: "/inbox" });
  }, [role, navigate]);

  async function load() {
    const [s, p, r, c] = await Promise.all([
      supabase.from("workspace_settings")
        .select("id,business_hours_start,business_hours_end,business_days,timezone,away_message,away_message_enabled")
        .limit(1).maybeSingle(),
      supabase.from("profiles").select("id,name,email").order("name"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("conversations").select("assigned_to"),
    ]);
    if (s.data) {
      setSettings({
        ...(s.data as Settings),
        business_hours_start: (s.data.business_hours_start as string).slice(0, 5),
        business_hours_end: (s.data.business_hours_end as string).slice(0, 5),
      });
    }
    const gestorIds = new Set(((r.data ?? []) as { user_id: string; role: string }[])
      .filter((x) => isManagerRole(x.role as AppRole)).map((x) => x.user_id));
    const convs = (c.data ?? []) as { assigned_to: string | null }[];
    setMembers(((p.data ?? []) as { id: string; name: string; email: string }[])
      .map((m) => ({
        ...m,
        isGestor: gestorIds.has(m.id),
        convCount: convs.filter((cv) => cv.assigned_to === m.id).length,
      })));

    try {
      const [accs, access] = await Promise.all([fetchAccounts(), fetchAccess()]);
      setAccounts(accs.map((a) => ({
        id: a.id, display_name: a.display_name, phone_number: a.phone_number, enabled: a.enabled,
      })));
      const map: Record<string, Set<string>> = {};
      for (const row of access) {
        if (!map[row.user_id]) map[row.user_id] = new Set();
        map[row.user_id].add(row.account_id);
      }
      setAccessMap(map);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function toggleAccess(userId: string, accountId: string) {
    const current = new Set(accessMap[userId] ?? new Set<string>());
    if (current.has(accountId)) current.delete(accountId);
    else current.add(accountId);
    setAccessMap((m) => ({ ...m, [userId]: current }));
    try {
      await setAccessFn({ data: { user_id: userId, account_ids: Array.from(current) } });
    } catch (e) {
      toast.error((e as Error).message);
      void load();
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("workspace_settings")
      .update({
        business_hours_start: settings.business_hours_start,
        business_hours_end: settings.business_hours_end,
        business_days: settings.business_days,
        timezone: settings.timezone,
        away_message: settings.away_message,
        away_message_enabled: settings.away_message_enabled,
        updated_by: user?.id ?? null,
      })
      .eq("id", settings.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Configurações salvas");
  }

  async function toggleGestor(m: Member) {
    if (m.id === user?.id && m.isGestor) {
      const otherGestors = members.filter((x) => x.isGestor && x.id !== m.id).length;
      if (otherGestors === 0) return toast.error("Não é possível remover o último gestor");
    }
    if (m.isGestor) {
      const { error } = await supabase.from("user_roles")
        .delete().eq("user_id", m.id).eq("role", "gestor");
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles")
        .insert({ user_id: m.id, role: "gestor" });
      if (error) return toast.error(error.message);
    }
    toast.success(`${m.name} ${m.isGestor ? "rebaixado a vendedor" : "promovido a gestor"}`);
    void load();
  }

  function toggleDay(d: number) {
    if (!settings) return;
    const set = new Set(settings.business_days);
    if (set.has(d)) set.delete(d); else set.add(d);
    setSettings({ ...settings, business_days: Array.from(set).sort() });
  }

  if (loading || !settings) {
    return (
      <div className="flex-1 grid place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
          <SettingsIcon className="size-5 text-primary shrink-0" />
          <span className="truncate">Configurações do workspace</span>
        </h1>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="size-4" /> Horário de atendimento
              </CardTitle>
              <CardDescription>Define quando o time está disponível.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Início</Label>
                  <Input type="time" value={settings.business_hours_start}
                    onChange={(e) => setSettings({ ...settings, business_hours_start: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fim</Label>
                  <Input type="time" value={settings.business_hours_end}
                    onChange={(e) => setSettings({ ...settings, business_hours_end: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Dias úteis</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const active = settings.business_days.includes(d.v);
                    return (
                      <Button
                        key={d.v}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => toggleDay(d.v)}
                      >
                        {d.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Fuso horário</Label>
                <Input value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  placeholder="America/Sao_Paulo" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Mensagem fora do horário</CardTitle>
              <CardDescription>
                Resposta automática enviada fora do horário de atendimento.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Ativada</Label>
                <Switch checked={settings.away_message_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, away_message_enabled: v })} />
              </div>
              <Textarea rows={4} value={settings.away_message}
                onChange={(e) => setSettings({ ...settings, away_message: e.target.value })} />
            </CardContent>
          </Card>

          <div className="flex sm:justify-end">
            <Button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              Salvar configurações
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageCircle className="size-4" /> Integrações
              </CardTitle>
              <CardDescription>Conecte canais de mensageria e APIs externas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                to="/settings/whatsapp-accounts"
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Phone className="size-3.5" /> Contas WhatsApp (multi-conta)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cadastre múltiplos números Meta · {accounts.length} conta(s) ativa(s)
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/settings/whatsapp"
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">WhatsApp Cloud API (legado)</p>
                  <p className="text-xs text-muted-foreground">
                    Configuração de conta única — em desuso
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/settings/wa-templates"
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <MessageCircle className="size-3.5" /> Templates WhatsApp (Meta)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cadastre templates e envie para aprovação da Meta automaticamente
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/settings/tags"
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">Tags de conversas</p>
                  <p className="text-xs text-muted-foreground">
                    Crie e edite as tags usadas para classificar conversas
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <Link
                to="/settings/media-retention"
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
              >
                <div>
                  <p className="text-sm font-medium">Retenção de mídia</p>
                  <p className="text-xs text-muted-foreground">
                    Apaga áudios/vídeos antigos automaticamente para conter o storage
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>

          <TransferConversationsCard members={members} onDone={() => void load()} />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="size-4" /> Membros e papéis
              </CardTitle>
              <CardDescription>
                Promova ou rebaixe gestores e defina a quais contas WhatsApp cada vendedor tem acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile: card list */}
              <div className="md:hidden divide-y">
                {members.map((m) => (
                  <div key={m.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{m.name}</span>
                          {m.isGestor ? (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">
                              <Crown className="size-3 mr-1" /> Gestor
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Vendedor</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => toggleGestor(m)} className="shrink-0">
                        {m.isGestor ? "Rebaixar" : "Promover"}
                      </Button>
                    </div>
                    {!m.isGestor && accounts.length > 0 && (
                      <AccountAccessControl
                        accounts={accounts}
                        selected={accessMap[m.id] ?? new Set()}
                        onToggle={(accountId) => toggleAccess(m.id, accountId)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Papel</TableHead>
                      <TableHead>Contas WhatsApp</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-sm">{m.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.email}</TableCell>
                        <TableCell>
                          {m.isGestor ? (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">
                              <Crown className="size-3 mr-1" /> Gestor
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Vendedor</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.isGestor ? (
                            <span className="text-xs text-muted-foreground">Acesso total</span>
                          ) : accounts.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <AccountAccessControl
                              accounts={accounts}
                              selected={accessMap[m.id] ?? new Set()}
                              onToggle={(accountId) => toggleAccess(m.id, accountId)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => toggleGestor(m)}>
                            {m.isGestor ? "Rebaixar" : "Promover"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function AccountAccessControl({
  accounts,
  selected,
  onToggle,
}: {
  accounts: AccountLite[];
  selected: Set<string>;
  onToggle: (accountId: string) => void;
}) {
  const count = selected.size;
  const summary =
    count === 0 ? "Nenhuma conta" : count === accounts.length ? "Todas as contas" : `${count} conta(s)`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <Phone className="size-3.5" />
          <span className="text-xs">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2 py-1">
          Contas WhatsApp permitidas
        </div>
        <div className="max-h-64 overflow-y-auto">
          {accounts.map((a) => {
            const on = selected.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onToggle(a.id)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-accent text-left"
              >
                <Checkbox checked={on} className="pointer-events-none" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.display_name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {a.phone_number ?? "—"}
                    {!a.enabled && " · desativada"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TransferConversationsCard({
  members,
  onDone,
}: {
  members: Member[];
  onDone: () => void;
}) {
  const reassign = useServerFn(reassignAll);
  const remove = useServerFn(removeMember);
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("__none");
  const [busy, setBusy] = useState(false);

  const fromMember = members.find((m) => m.id === fromId);
  const candidates = members.filter((m) => m.id !== fromId);
  const sellersWithConvs = members.filter((m) => m.convCount > 0);

  async function submitTransfer() {
    if (!fromId) return toast.error("Escolha um vendedor de origem");
    setBusy(true);
    try {
      const res = await reassign({
        data: { from_user_id: fromId, to_user_id: toId === "__none" ? null : toId },
      });
      toast.success(`${res.moved} conversa(s) transferida(s)`);
      setOpen(false);
      setFromId("");
      setToId("__none");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(id: string) {
    try {
      await remove({ data: { user_id: id } });
      toast.success("Membro removido");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <ArrowRightLeft className="size-4" /> Transferir conversas
        </CardTitle>
        <CardDescription>
          Mova as conversas atribuídas de um vendedor para outro — útil em férias,
          desligamentos ou redistribuição.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              <ArrowRightLeft className="size-4 mr-2" /> Transferir conversas
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transferir conversas</DialogTitle>
              <DialogDescription>
                Selecione o vendedor de origem e para quem as conversas serão movidas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>De</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} · {m.convCount} conv.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Para</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem responsável</SelectItem>
                    {candidates.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fromMember && (
                <p className="text-xs text-muted-foreground">
                  {fromMember.convCount} conversa(s) serão movidas.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submitTransfer} disabled={busy || !fromId}>
                {busy && <Loader2 className="size-4 mr-2 animate-spin" />}
                Transferir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {sellersWithConvs.length > 0 && (
          <div className="rounded-md border divide-y">
            {sellersWithConvs.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-3 gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.convCount} conversa(s) atribuída(s)
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setFromId(m.id); setOpen(true); }}
                  >
                    <ArrowRightLeft className="size-4 mr-1" /> Transferir
                  </Button>
                  {m.id !== user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          aria-label="Remover membro"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover {m.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O acesso será revogado e suas {m.convCount} conversa(s)
                            ficarão sem responsável. Ação irreversível.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeUser(m.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

