
CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','sending','completed','failed');

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  template_id uuid,
  filter_label conv_label,
  filter_status conv_status,
  status campaign_status NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read campaigns"
  ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor insert campaigns"
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));
CREATE POLICY "Gestor update campaigns"
  ON public.campaigns FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role));
CREATE POLICY "Gestor delete campaigns"
  ON public.campaigns FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
