import type { Database } from "@/integrations/supabase/types";

export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type ConvLabel = Database["public"]["Enums"]["conv_label"];
export type ConvStatus = Database["public"]["Enums"]["conv_status"];

export const LABEL_META: Record<ConvLabel, { name: string; emoji: string; className: string }> = {
  hot: { name: "Quente", emoji: "🔥", className: "bg-[var(--color-label-hot)]/15 text-[var(--color-label-hot)] border-[var(--color-label-hot)]/30" },
  warm: { name: "Morno", emoji: "🌤️", className: "bg-[var(--color-label-warm)]/15 text-[var(--color-label-warm)] border-[var(--color-label-warm)]/30" },
  cold: { name: "Frio", emoji: "❄️", className: "bg-[var(--color-label-cold)]/15 text-[var(--color-label-cold)] border-[var(--color-label-cold)]/30" },
  new: { name: "Novo", emoji: "🆕", className: "bg-[var(--color-label-new)]/15 text-[var(--color-label-new)] border-[var(--color-label-new)]/30" },
  closed: { name: "Fechado", emoji: "✅", className: "bg-[var(--color-label-closed)]/15 text-[var(--color-label-closed)] border-[var(--color-label-closed)]/30" },
};

export const STATUS_LABEL: Record<ConvStatus, string> = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  encerrada: "Encerrada",
};

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
