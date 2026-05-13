
CREATE TABLE public.whatsapp_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  access_token text,
  phone_number_id text,
  verify_token text,
  app_secret text,
  business_account_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.whatsapp_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor select whatsapp_settings"
ON public.whatsapp_settings FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "gestor update whatsapp_settings"
ON public.whatsapp_settings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'))
WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE TRIGGER whatsapp_settings_updated_at
BEFORE UPDATE ON public.whatsapp_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
