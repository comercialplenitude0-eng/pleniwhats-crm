
-- Source enum for campaign recipients
DO $$ BEGIN
  CREATE TYPE public.campaign_source AS ENUM ('filter', 'csv', 'rd_station');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS source public.campaign_source NOT NULL DEFAULT 'filter',
  ADD COLUMN IF NOT EXISTS recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rd_segment_id text,
  ADD COLUMN IF NOT EXISTS rd_segment_name text;
