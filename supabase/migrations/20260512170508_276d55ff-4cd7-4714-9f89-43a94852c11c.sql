
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS rd_pipeline_id text,
  ADD COLUMN IF NOT EXISTS rd_pipeline_name text,
  ADD COLUMN IF NOT EXISTS rd_stage_id text,
  ADD COLUMN IF NOT EXISTS rd_stage_name text,
  ADD COLUMN IF NOT EXISTS rd_next_stage_id text,
  ADD COLUMN IF NOT EXISTS rd_next_stage_name text,
  ADD COLUMN IF NOT EXISTS rd_move_on_send boolean NOT NULL DEFAULT true;
