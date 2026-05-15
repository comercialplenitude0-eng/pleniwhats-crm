# Plano de escalabilidade — 10 frentes

Entrega em **5 fases**, cada uma estável e testável. Ao fim de cada fase eu paro, te mostro o que mudou e só sigo com seu OK.

---

## Fase 1 — Webhook resiliente (itens 1 + 10a)

**Problema:** `/api/public/hooks/whatsapp` processa tudo síncrono. Se a Meta não receber 200 em ~5s, ela reenvia → mensagem duplicada. `findOrCreateConversation` faz scan completo.

**O que entra:**
- Tabela `webhook_events` (`id`, `provider`, `payload jsonb`, `received_at`, `status` [`pending|processing|done|failed`], `attempts`, `last_error`, `wamid`).
- Webhook só valida assinatura, faz `INSERT` e responde **200 OK** em <500ms.
- Cron de 1 min chama `/api/public/hooks/process-webhook-queue` que processa lote `pending` com `FOR UPDATE SKIP LOCKED`.
- Índice único em `messages(wamid)` para idempotência (ignora duplicatas).
- `findOrCreateConversation` passa a usar índice `conversations(account_id, contact_phone)`.

---

## Fase 2 — Índices e hot-path do banco (item 2)

**Problema:** queries do inbox e realtime fazem seq scan em tabelas que vão crescer rápido.

**O que entra:**
- `CREATE INDEX messages_conv_created_idx ON messages(conversation_id, created_at DESC)`
- `CREATE UNIQUE INDEX messages_wamid_uidx ON messages(wamid) WHERE wamid IS NOT NULL`
- `CREATE INDEX conversations_account_last_idx ON conversations(account_id, last_message_at DESC)`
- `CREATE INDEX conversations_assigned_idx ON conversations(assigned_to) WHERE assigned_to IS NOT NULL`
- `CREATE INDEX conversation_tags_conv_idx ON conversation_tags(conversation_id)`
- `CREATE INDEX conversation_tags_tag_idx ON conversation_tags(tag_id)`
- `CREATE INDEX contacts_phone_idx ON contacts(phone)`
- Trigger `bump_conversation` ganha proteção: só atualiza se `last_message_at` mudou >2s (debounce simples).

---

## Fase 3 — Inbox em tempo real otimizado (item 3)

**Problema:** `inbox.tsx` faz `load()` (SELECT * sem limite) a cada evento realtime. Com 1000+ conversas, trava o navegador.

**O que entra (somente frontend):**
- Realtime filtrado por `account_id` quando vendedor tem só 1 conta, ou por `assigned_to` para vendedor.
- Patch incremental: ao receber UPDATE/INSERT, atualiza só a conversa afetada no estado local (sem refetch).
- Paginação: carrega 50 conversas iniciais, scroll infinito carrega mais.
- Debounce de 300ms em refetch quando vários eventos chegam juntos.

---

## Fase 4 — Fila de envio + mídia lazy (itens 4 + 5)

**Problema:** `sendText/Template/Media` chama Graph API direto na request do usuário. Se a Meta retornar 429/5xx, perde a mensagem. Mídias são baixadas sempre, mesmo que ninguém abra.

**O que entra:**
- Tabela `outbound_queue` (`id`, `conversation_id`, `account_id`, `payload jsonb`, `status` [`queued|sending|sent|failed`], `attempts`, `next_attempt_at`, `last_error`, `wamid`).
- `sendText/Template/Media` insere na fila e responde 200 imediato; UI mostra "enviando".
- Cron de 30s processa fila com backoff exponencial (1s, 5s, 30s, 2min, 10min, então `failed`).
- Mídia inbound: salva só `media_id` no webhook; download real vai pra fila separada `media_download_queue` e roda em background.
- UI de chat: clicar no anexo dispara download sob demanda se ainda não baixado.

---

## Fase 5 — Observabilidade + race conditions (itens 8 + 10b)

**Problema:** sem logs estruturados não dá pra saber por que uma mensagem sumiu. `claim_gestor_if_none` tem race em signups simultâneos.

**O que entra:**
- Tabela `app_logs` (`level`, `source`, `message`, `meta jsonb`, `created_at`) com retenção de 30 dias.
- Helper `logEvent()` chamado em pontos críticos (webhook recv, queue process, send fail, RD CRM call).
- Página **Configurações → Logs** (só admin) com filtro por nível/fonte e busca.
- `claim_gestor_if_none` ganha `LOCK TABLE user_roles IN EXCLUSIVE MODE` no início (evita 2 admins criados ao mesmo tempo).
- Dashboard ganha card "Saúde do sistema" mostrando: fila pendente, falhas última hora, último webhook recebido.

---

## Itens fora do plano técnico

- **Item 6 — Particionar `messages`:** só faz sentido com >5M linhas. Fica registrado, executo quando o volume justificar.
- **Item 7 — RLS expensive:** vou rodar `supabase--linter` ao fim de cada fase e otimizar o que aparecer. Sem mudança preventiva.
- **Item 9 — Upgrade compute:** decisão de billing, não de código. Te aviso quando o Postgres estiver perto do teto.

---

## Detalhes técnicos

### Ordem
Fase 1 destrava o gargalo mais crítico (perda/duplicação de mensagens). Fase 2 dá performance de leitura imediata. Fase 3 melhora UX percebida. Fase 4 protege envios. Fase 5 fecha o ciclo com visibilidade.

### Compatibilidade
Toda fase tem migration reversível. Fila e webhook_events começam vazios; código antigo continua funcionando até o cron entrar em ação. Nenhum dado existente é alterado.

### Custo no banco
Cada cron novo é 1 chamada/min via `pg_net`. Carga insignificante. Índices custam ~10-15% mais em INSERT, ganho em SELECT é >10x.

### Estimativa
- Fase 1: 1 migration grande + 3 arquivos
- Fase 2: 1 migration de índices
- Fase 3: 2 arquivos (inbox.tsx + ConversationList.tsx)
- Fase 4: 1 migration + 4 arquivos
- Fase 5: 1 migration + 3 arquivos + 1 página nova

Aprove e eu começo pela **Fase 1**.
