# Plano: alinhar sistema ao documento técnico

São 4 mudanças arquiteturais grandes. Vou entregar uma fase por vez, cada uma estável e testável antes de seguir. Você aprova esse plano e eu começo pela Fase 1; ao final de cada fase eu paro, te mostro o que ficou e só sigo pra próxima com seu OK.

---

## Fase 1 — Multi-conta WhatsApp

**Objetivo:** suportar N números da Meta no mesmo workspace, cada vendedor vinculado a um ou mais números.

### Banco
- Nova tabela `whatsapp_accounts` (`id`, `display_name`, `phone_number`, `phone_number_id`, `business_account_id`, `access_token`, `app_secret`, `verify_token`, `enabled`).
- Nova tabela `user_whatsapp_access` (`user_id`, `account_id`) — N:N.
- `conversations` e `messages` ganham `account_id` (FK para `whatsapp_accounts`). Migration popula com a primeira conta migrada de `whatsapp_settings`.
- `whatsapp_settings` vira legado (mantida só para não quebrar nada já em produção, depois descontinuada).
- RLS atualizada: vendedor só vê conversas de contas em `user_whatsapp_access` (ou atribuídas a ele); gestor vê tudo.

### App
- Tela **Configurações → Contas WhatsApp**: lista, criar, editar, desativar conta. Cada conta tem seu próprio webhook URL exibido.
- Tela **Equipe**: ao editar usuário, multiselect de contas que ele acessa.
- **Inbox**: filtro de conta no topo da lista (chip "Todas / Conta X / Conta Y").
- **Webhook** `/api/public/hooks/whatsapp` passa a rotear pelo `phone_number_id` do payload → resolve `account_id`.
- Funções de envio (`sendText`, `sendTemplate`, `sendMedia`) recebem `account_id` e usam o token da conta.

---

## Fase 2 — Roles Admin / Gestor / Comercial / CS

**Objetivo:** trocar o enum `app_role` (`gestor`/`vendedor`) por 4 níveis, sem quebrar autorização.

- Migration: adicionar valores `admin`, `comercial`, `cs` ao enum `app_role`. Mapear `vendedor` → `comercial` via update.
- Helpers: `is_manager_role()` retorna true para `admin` e `gestor` (substitui `has_role(_, 'gestor')` em massa nas RLS).
- Tela **Equipe**: dropdown de role com 4 opções, badges com cores distintas.
- Telas restritas a gestor passam a aceitar admin também (Configurações, Campanhas, Automações, Equipe).

---

## Fase 3 — Tags editáveis com sync Meta

**Objetivo:** substituir o enum fixo `conv_label` por tabela editável, com cor e `meta_tag_id` para sincronização.

- Nova tabela `tags` (`id`, `name`, `color`, `meta_tag_id`, `account_id` opcional).
- Nova tabela `conversation_tags` (N:N entre `conversations` e `tags`).
- `conv_label` mantido por compatibilidade; UI passa a usar a nova tabela.
- Tela **Configurações → Tags**: CRUD com preview de cor.
- Inbox: filtro por tags multiseleção; chips coloridos no card da conversa.
- Função (server) `syncTagsFromMeta(account_id)` busca labels via Graph API e faz upsert por `meta_tag_id`.

---

## Fase 4 — Tabela `contacts` unificada

**Objetivo:** 1 contato (telefone) → N conversas em N contas, sem duplicar `contact_name` em cada linha.

- Nova tabela `contacts` (`id`, `phone`, `name`, `avatar`, `crm_id`).
- `conversations.contact_id` (FK), com migration que cria contatos a partir dos `contact_phone` distintos.
- Colunas `contact_name`/`contact_phone`/`contact_avatar` mantidas como cache durante transição, depois removidas.
- Tela **Contatos**: passa a ler de `contacts`, mostrando todas as conversas (em todas as contas) de cada contato.

---

## Detalhes técnicos

### Ordem obrigatória
Fase 1 vem primeiro porque tudo depois (roles, tags por conta, contacts cross-account) faz mais sentido com `account_id` no schema. Cada fase é uma migration + um conjunto de telas. Sem mudar várias coisas no mesmo PR.

### Compatibilidade
Toda migration faz **backfill** dos dados existentes antes de aplicar `NOT NULL`. Nenhuma conversa atual será perdida. As colunas legadas (`whatsapp_settings`, `conv_label`, `contact_name`) ficam por algumas fases para garantir rollback.

### RLS
Cada fase reescreve as policies afetadas usando `SECURITY DEFINER` helpers para evitar recursão. Vou rodar o linter de RLS depois de cada migration.

### Fora de escopo (por enquanto)
- Não vou tocar no builder de automações nem em campanhas — já estão prontos e melhores que o spec.
- Painel CRM (RD Station) também fica como está.
- Foto de perfil WhatsApp: doc explicitamente diz que fica no Meta Business, então nada a fazer.

### Estimativa
- Fase 1: ~8 arquivos novos/editados + migration grande
- Fase 2: ~4 arquivos + migration
- Fase 3: ~5 arquivos + migration
- Fase 4: ~6 arquivos + migration

Aprove esse plano e eu começo pela Fase 1 (multi-conta WhatsApp).
