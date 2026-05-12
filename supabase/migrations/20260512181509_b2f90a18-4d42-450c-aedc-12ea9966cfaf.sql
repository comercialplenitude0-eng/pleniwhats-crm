ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS rd_deal_id text;
CREATE INDEX IF NOT EXISTS idx_conversations_rd_deal_id ON public.conversations(rd_deal_id);