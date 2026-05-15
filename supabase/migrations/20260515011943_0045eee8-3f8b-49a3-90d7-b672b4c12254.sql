
-- Fila de envio para o WhatsApp
CREATE TABLE IF NOT EXISTS public.outbound_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  account_id uuid,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|sending|sent|failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  wamid text
);

CREATE INDEX IF NOT EXISTS outbound_queue_pending_idx
  ON public.outbound_queue (status, next_attempt_at)
  WHERE status IN ('queued','sending');

CREATE INDEX IF NOT EXISTS outbound_queue_message_idx
  ON public.outbound_queue (message_id);

ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager read outbound_queue"
  ON public.outbound_queue FOR SELECT
  TO authenticated
  USING (public.is_manager_role(auth.uid()));

-- Mídia lazy: armazenar referência sem baixar imediatamente
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_id text;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_status text NOT NULL DEFAULT 'none';
  -- valores: 'none' (sem mídia), 'pending', 'ready', 'failed'

CREATE INDEX IF NOT EXISTS messages_media_pending_idx
  ON public.messages (created_at)
  WHERE media_status = 'pending';

-- Permite valor 'pending' para outbound enquanto enfileirado
-- (msg_status já tem 'sent','delivered','read','failed'; adicionamos 'queued')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'queued'
      AND enumtypid = 'public.msg_status'::regtype
  ) THEN
    ALTER TYPE public.msg_status ADD VALUE 'queued';
  END IF;
END$$;
