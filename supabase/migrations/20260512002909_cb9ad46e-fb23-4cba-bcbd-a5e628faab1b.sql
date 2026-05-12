
CREATE TABLE public.alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  max_response_time_min integer NOT NULL DEFAULT 30,
  min_conversion_rate integer NOT NULL DEFAULT 20,
  max_waiting integer NOT NULL DEFAULT 10,
  max_unread_per_seller integer NOT NULL DEFAULT 15,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read alert settings"
  ON public.alert_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only gestor can insert alert settings"
  ON public.alert_settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Only gestor can update alert settings"
  ON public.alert_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER alert_settings_updated_at
  BEFORE UPDATE ON public.alert_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.alert_settings (singleton) VALUES (true)
  ON CONFLICT DO NOTHING;
