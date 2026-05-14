import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isManagerRole } from "@/lib/auth";
import { inviteMember, getTeamOverview, type TeamOverviewRow } from "@/lib/team.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, UserPlus, Crown, Headphones, Copy } from "lucide-react";
import { initials } from "@/lib/inbox-types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

type Profile = { id: string; name: string; email: string; avatar_url: string | null };
type Role = "admin" | "gestor" | "comercial" | "cs" | "vendedor";

type Member = Profile & {
  role: Role;
  stats: TeamOverviewRow | null;
};

const ROLE_OPTIONS: Array<{ value: Exclude<Role, "vendedor">; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "gestor", label: "Gestor" },
  { value: "comercial", label: "Comercial" },
  { value: "cs", label: "CS" },
];

function roleLabelLocal(r: Role): string {
  switch (r) {
    case "admin": return "Admin";
    case "gestor": return "Gestor";
    case "cs": return "CS";
    default: return "Vendedor";
  }
}

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

type Presence = "online" | "away" | "offline";

function computePresence(stats: TeamOverviewRow | null): Presence {
  if (!stats?.last_seen_at) return "offline";
  const seenMs = Date.now() - new Date(stats.last_seen_at).getTime();
  if (seenMs > 2 * 60 * 1000) return "offline";
  const lastOut = stats.last_outbound_at ? Date.now() - new Date(stats.last_outbound_at).getTime() : Infinity;
  if (lastOut > 15 * 60 * 1000) return "away";
  return "online";
}

const PRESENCE_META: Record<Presence, { dot: string; label: string; pill: string }> = {
  online: {
    dot: "bg-emerald-500 ring-emerald-500/30",
    label: "Online",
    pill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  },
  away: {
    dot: "bg-amber-500 ring-amber-500/30",
    label: "Ausente",
    pill: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  },
  offline: {
    dot: "bg-zinc-500 ring-zinc-500/20",
    label: "Offline",
    pill: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
};

// Stable HSL color from name → for the avatar gradient.
function colorFromName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 55%)`;
}

function formatRespTime(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.round(seconds / 60);
  if (m < 1) return `${Math.round(seconds)}s`;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h${rm}` : `${h}h`;
}

function TeamPage() {
  const { role, profile } = useAuth();
  const invite = useServerFn(inviteMember);
  const fetchOverview = useServerFn(getTeamOverview);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, r, statsRes] = await Promise.all([
      supabase.from("profiles").select("id,name,email,avatar_url"),
      supabase.from("user_roles").select("user_id,role"),
      fetchOverview().catch(() => [] as TeamOverviewRow[]),
    ]);
    const profiles = (p.data ?? []) as Profile[];
    const roles = (r.data ?? []) as { user_id: string; role: Role }[];
    const statsMap = new Map<string, TeamOverviewRow>();
    for (const s of statsRes) statsMap.set(s.user_id, s);
    const priority: Role[] = ["admin", "gestor", "cs", "comercial", "vendedor"];
    setMembers(
      profiles.map((pr) => ({
        ...pr,
        role: priority.find((p) => roles.some((x) => x.user_id === pr.id && x.role === p)) ?? "comercial",
        stats: statsMap.get(pr.id) ?? null,
      })),
    );
    setLoading(false);
  }, [fetchOverview]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const { managers, sellers } = useMemo(() => {
    const managers = members.filter((m) => isManagerRole(m.role));
    const sellers = members.filter((m) => !isManagerRole(m.role));
    return { managers, sellers };
  }, [members]);

  if (!isManagerRole(role)) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <Card className="max-w-md">
          <CardHeader><CardTitle>Acesso restrito</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apenas <strong>gestores</strong> podem gerenciar a equipe.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <header className="px-4 sm:px-6 py-4 border-b bg-card flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold">Equipe</h1>
          <p className="text-xs text-muted-foreground">
            {sellers.length} {sellers.length === 1 ? "vendedor" : "vendedores"} ·{" "}
            {managers.length} {managers.length === 1 ? "gestor" : "gestores"}
          </p>
        </div>
        <InviteDialog
          onInvite={async (payload) => {
            await invite({ data: payload });
            await load();
          }}
        />
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-8">
          {loading ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Section title="Gestores" icon={<Crown className="size-4 text-amber-500" />}>
                <CardGrid>
                  {managers.map((m) => (
                    <MemberCard key={m.id} m={m} isSelf={m.id === profile?.id} />
                  ))}
                  {managers.length === 0 && <Empty label="Nenhum gestor cadastrado" />}
                </CardGrid>
              </Section>

              <Section title="Vendedores" icon={<Headphones className="size-4 text-primary" />}>
                <CardGrid>
                  {sellers.map((m) => (
                    <MemberCard key={m.id} m={m} isSelf={m.id === profile?.id} />
                  ))}
                  {sellers.length === 0 && <Empty label="Nenhum vendedor cadastrado" />}
                </CardGrid>
              </Section>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3 uppercase tracking-wider text-xs font-semibold text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="col-span-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function MemberCard({ m, isSelf }: { m: Member; isSelf: boolean }) {
  const presence = computePresence(m.stats);
  const meta = PRESENCE_META[presence];
  const bg = colorFromName(m.name);

  return (
    <Link
      to="/team/$userId"
      params={{ userId: m.id }}
      className="block group focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
    >
      <Card className="overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar className="size-16 ring-2 ring-border">
                <AvatarFallback
                  className="text-white text-lg font-semibold"
                  style={{ backgroundColor: bg }}
                >
                  {initials(m.name)}
                </AvatarFallback>
              </Avatar>
              <span
                className={cn(
                  "absolute bottom-0 right-0 size-4 rounded-full ring-4 ring-card",
                  meta.dot,
                )}
                aria-label={meta.label}
              />
            </div>

            <div className="mt-3 w-full min-w-0">
              <div className="font-semibold truncate flex items-center justify-center gap-1.5">
                {m.name}
                {isSelf && <span className="text-[10px] text-muted-foreground">(você)</span>}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                {isManagerRole(m.role) ? <Crown className="size-3" /> : <Headphones className="size-3" />}
                {roleLabelLocal(m.role)}
              </div>
              <Badge variant="outline" className={cn("mt-2 text-[10px] font-medium", meta.pill)}>
                <span className={cn("size-1.5 rounded-full mr-1.5", meta.dot)} />
                {meta.label}
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 w-full pt-3 border-t">
              <Stat value={m.stats?.convs_count ?? 0} label="Convs." />
              <Stat value={m.stats?.closed_count ?? 0} label="Fechados" valueClass="text-emerald-500" />
              <Stat
                value={formatRespTime(m.stats?.avg_response_seconds ?? null)}
                label="TM resp."
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Stat({ value, label, valueClass }: { value: string | number; label: string; valueClass?: string }) {
  return (
    <div className="text-center">
      <div className={cn("text-base font-bold tabular-nums", valueClass)}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function InviteDialog({
  onInvite,
}: {
  onInvite: (p: {
    email: string;
    name: string;
    role: Exclude<Role, "vendedor">;
    password: string;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleVal, setRoleVal] = useState<Exclude<Role, "vendedor">>("comercial");
  const [password, setPassword] = useState(() => randomPassword());
  const [submitting, setSubmitting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  function reset() {
    setName(""); setEmail(""); setRoleVal("comercial");
    setPassword(randomPassword()); setCreatedCreds(null);
  }

  async function submit() {
    if (!name.trim() || !email.trim() || password.length < 8) {
      toast.error("Preencha nome, e-mail e senha (mín. 8)"); return;
    }
    setSubmitting(true);
    try {
      await onInvite({ name: name.trim(), email: email.trim(), role: roleVal, password });
      setCreatedCreds({ email: email.trim(), password });
      toast.success("Membro criado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4 mr-2" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            Crie uma conta. Compartilhe a senha — o membro pode alterá-la depois.
          </DialogDescription>
        </DialogHeader>

        {createdCreds ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">E-mail: </span>{createdCreds.email}</div>
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="text-muted-foreground">Senha: </span>
                  <code className="font-mono">{createdCreds.password}</code>
                </span>
                <Button size="sm" variant="ghost" onClick={() => {
                  void navigator.clipboard.writeText(`E-mail: ${createdCreds.email}\nSenha: ${createdCreds.password}`);
                  toast.success("Copiado");
                }}>
                  <Copy className="size-3.5 mr-1" /> Copiar
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => reset()}>Convidar outro</Button>
              <Button onClick={() => setOpen(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select value={roleVal} onValueChange={(v) => setRoleVal(v as Exclude<Role, "vendedor">)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Senha inicial</Label>
                <div className="flex gap-2">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono text-sm" />
                  <Button type="button" variant="outline" size="icon"
                    onClick={() => setPassword(randomPassword())} title="Gerar nova senha">↻</Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                Criar membro
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
