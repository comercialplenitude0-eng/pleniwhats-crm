
-- Tabela de fila de webhooks recebidos
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'whatsapp',
  payload jsonb NOT NULL,
  signature text,
  phone_number_id text,
  wamid text,
  status text NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_events_pending_idx
  ON public.webhook_events (status, next_attempt_at)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS webhook_events_received_idx
  ON public.webhook_events (received_at DESC);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager read webhook_events"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.is_manager_role(auth.uid()));

-- Idempotência: nunca duas mensagens com o mesmo wamid
CREATE UNIQUE INDEX IF NOT EXISTS messages_wamid_uidx
  ON public.messages (wamid)
  WHERE wamid IS NOT NULL;

-- Acelera findOrCreateConversation (account + telefone)
CREATE INDEX IF NOT EXISTS conversations_account_phone_idx
  ON public.conversations (account_id, contact_phone);
