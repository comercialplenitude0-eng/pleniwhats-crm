import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, BarChart3, Crown, Zap, Users, Contact, Settings, Workflow } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export function AppRail() {
  const { role, user } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [hasGestor, setHasGestor] = useState(true);
  const [unreadInbox, setUnreadInbox] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (role === "gestor") return;
    supabase.from("user_roles").select("role").eq("role", "gestor").limit(1)
      .then(({ data }) => setHasGestor((data?.length ?? 0) > 0));
  }, [role]);

  // Reset badge when on inbox
  useEffect(() => {
    if (path.startsWith("/inbox")) setUnreadInbox(0);
  }, [path]);

  // Realtime: new inbound messages
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("rt-inbound-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "direction=eq.inbound" },
        async (payload) => {
          const msg = payload.new as { id: string; conversation_id: string; content: string | null };
          if (seenRef.current.has(msg.id)) return;
          seenRef.current.add(msg.id);
          // Fetch conversation to check if user has access (RLS would filter, but we got the event — verify)
          const { data: conv } = await supabase
            .from("conversations")
            .select("id,contact_name,assigned_to")
            .eq("id", msg.conversation_id)
            .maybeSingle();
          if (!conv) return;
          if (role !== "gestor" && conv.assigned_to !== user.id) return;

          if (!window.location.pathname.startsWith("/inbox")) {
            setUnreadInbox((n) => n + 1);
            toast(`Nova mensagem · ${conv.contact_name}`, {
              description: msg.content?.slice(0, 80) ?? "[mídia]",
              action: {
                label: "Abrir",
                onClick: () => {
                  window.location.href = `/inbox?c=${conv.id}`;
                },
              },
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, role]);

  const items = [
    { to: "/inbox", icon: MessageCircle, label: "Inbox", show: true, badge: unreadInbox },
    { to: "/contacts", icon: Contact, label: "Contatos", show: true },
    { to: "/templates", icon: Zap, label: "Respostas rápidas", show: true },
    { to: "/dashboard", icon: BarChart3, label: "Dashboard", show: role === "gestor" },
    { to: "/team", icon: Users, label: "Equipe", show: role === "gestor" },
    { to: "/automations", icon: Workflow, label: "Automações", show: role === "gestor" },
    { to: "/settings", icon: Settings, label: "Configurações", show: role === "gestor" },
  ].filter((i) => i.show);

  async function claimGestor() {
    const { data, error } = await supabase.rpc("claim_gestor_if_none");
    if (error) return toast.error(error.message);
    if (data) {
      toast.success("Você agora é gestor. Recarregando...");
      setTimeout(() => window.location.reload(), 800);
    } else {
      toast.info("Já existe um gestor neste workspace.");
    }
  }

  return (
    <nav className="w-14 shrink-0 border-r bg-sidebar flex flex-col items-center py-3 gap-1">
      <div className="size-9 rounded-xl bg-primary grid place-items-center text-primary-foreground font-bold mb-2">
        P
      </div>
      {items.map((it) => {
        const active = path.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            title={it.label}
            className={cn(
              "size-10 grid place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors relative",
              active && "bg-accent text-primary"
            )}
          >
            <it.icon className="size-5" />
            {it.badge && it.badge > 0 ? (
              <Badge
                className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] tabular-nums"
                variant="destructive"
              >
                {it.badge > 9 ? "9+" : it.badge}
              </Badge>
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto">
        {role !== "gestor" && !hasGestor && (
          <Button
            size="icon"
            variant="ghost"
            onClick={claimGestor}
            title="Tornar-me gestor (nenhum gestor existe)"
            className="text-amber-500 hover:text-amber-600"
          >
            <Crown className="size-5" />
          </Button>
        )}
      </div>
    </nav>
  );
}
