import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle, BarChart3, Crown, Zap, Users, Contact } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function AppRail() {
  const { role } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [hasGestor, setHasGestor] = useState(true);

  useEffect(() => {
    if (role === "gestor") return;
    supabase.from("user_roles").select("role").eq("role", "gestor").limit(1)
      .then(({ data }) => setHasGestor((data?.length ?? 0) > 0));
  }, [role]);

  const items = [
    { to: "/inbox", icon: MessageCircle, label: "Inbox", show: true },
    { to: "/contacts", icon: Contact, label: "Contatos", show: true },
    { to: "/templates", icon: Zap, label: "Respostas rápidas", show: true },
    { to: "/dashboard", icon: BarChart3, label: "Dashboard", show: role === "gestor" },
    { to: "/team", icon: Users, label: "Equipe", show: role === "gestor" },
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
              "size-10 grid place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
              active && "bg-accent text-primary"
            )}
          >
            <it.icon className="size-5" />
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
