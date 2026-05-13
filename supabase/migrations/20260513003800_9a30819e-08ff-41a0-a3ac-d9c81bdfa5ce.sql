ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS course text,
  ADD COLUMN IF NOT EXISTS last_crm_note_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_auto_note_scan
  ON public.conversations (last_message_at)
  WHERE rd_deal_id IS NOT NULL OR contact_phone IS NOT NULL;