CREATE TABLE public.media_retention_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  retention_months integer NOT NULL DEFAULT 12 CHECK (retention_months BETWEEN 1 AND 60),
  media_types text[] NOT NULL DEFAULT ARRAY['audio','video']::text[],
  last_run_at timestamptz,
  last_run_deleted_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.media_retention_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read retention settings"
  ON public.media_retention_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only manager can insert retention settings"
  ON public.media_retention_settings FOR INSERT TO authenticated
  WITH CHECK (is_manager_role(auth.uid()));

CREATE POLICY "Only manager can update retention settings"
  ON public.media_retention_settings FOR UPDATE TO authenticated
  USING (is_manager_role(auth.uid()));

CREATE TRIGGER trg_media_retention_updated_at
  BEFORE UPDATE ON public.media_retention_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.media_retention_settings (singleton, enabled, retention_months, media_types)
VALUES (true, true, 12, ARRAY['audio','video']::text[])
ON CONFLICT DO NOTHING;