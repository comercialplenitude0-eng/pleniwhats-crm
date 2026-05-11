import { supabase } from "@/integrations/supabase/client";

/**
 * Cria 3 conversas de exemplo atribuídas ao usuário logado, com algumas mensagens.
 * Idempotente: só cria se o usuário ainda não tiver conversas.
 */
export async function seedDemoConversationsForCurrentUser(): Promise<number> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return 0;

  const { count } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", uid);
  if ((count ?? 0) > 0) return 0;

  const samples = [
    {
      contact_name: "Mariana Souza",
      contact_phone: "+55 11 91234-5678",
      label: "hot" as const,
      status: "em_atendimento" as const,
      crm_data: { curso: "MBA Gestão", origem: "Instagram", valor: "R$ 18.000" },
      messages: [
        { direction: "inbound" as const, content: "Oi! Vi o anúncio do MBA, ainda tem vagas?" },
        { direction: "outbound" as const, content: "Olá Mariana! Sim, ainda temos. Quer que eu te envie a grade?" },
        { direction: "inbound" as const, content: "Quero sim, por favor 🙏" },
      ],
    },
    {
      contact_name: "Carlos Eduardo",
      contact_phone: "+55 21 99876-5432",
      label: "warm" as const,
      status: "aguardando" as const,
      crm_data: { curso: "Pós Marketing Digital", origem: "Google Ads" },
      messages: [
        { direction: "inbound" as const, content: "Boa tarde, recebi o e-mail sobre a pós." },
        { direction: "inbound" as const, content: "Posso parcelar em quantas vezes?" },
      ],
    },
    {
      contact_name: "Beatriz Lima",
      contact_phone: "+55 31 98765-1122",
      label: "new" as const,
      status: "aguardando" as const,
      crm_data: { curso: "Graduação ADM", origem: "Indicação" },
      messages: [
        { direction: "inbound" as const, content: "Olá! Quero saber sobre a graduação em Administração." },
      ],
    },
  ];

  for (const s of samples) {
    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({
        contact_name: s.contact_name,
        contact_phone: s.contact_phone,
        label: s.label,
        status: s.status,
        assigned_to: uid,
        crm_data: s.crm_data,
        last_message: s.messages[s.messages.length - 1].content,
      })
      .select("id")
      .single();
    if (error || !conv) continue;
    for (const m of s.messages) {
      await supabase.from("messages").insert({
        conversation_id: conv.id,
        direction: m.direction,
        type: "text",
        content: m.content,
        sender_id: m.direction === "outbound" ? uid : null,
        status: "read",
      });
    }
  }
  return samples.length;
}
