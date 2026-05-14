CREATE INDEX IF NOT EXISTS idx_conversations_account_lastmsg ON public.conversations (account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_lastmsg ON public.conversations (assigned_to, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status_lastmsg ON public.conversations (status, last_message_at DESC);