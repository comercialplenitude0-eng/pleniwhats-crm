
CREATE TYPE public.wa_template_status AS ENUM (
  'draft', 'pending', 'approved', 'rejected', 'paused', 'disabled'
);

CREATE TYPE public.wa_template_category AS ENUM (
  'MARKETING', 'UTILITY', 'AUTHENTICATION'
);

CREATE TABLE public.whatsapp_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category public.wa_template_category NOT NULL DEFAULT 'MARKETING',
  header_type text,
  header_text text,
  body_text text NOT NULL,
  footer_text text,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  example jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_template_id text,
  status public.wa_template_status NOT NULL DEFAULT 'draft',
  rejection_reason text,
  last_sync_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, name, language)
);

CREATE INDEX idx_wa_templates_account ON public.whatsapp_message_templates(account_id);
CREATE INDEX idx_wa_templates_status ON public.whatsapp_message_templates(status);

ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read wa templates"
  ON public.whatsapp_message_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert own wa templates"
  ON public.whatsapp_message_templates FOR INSERT
  TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owner or manager can update wa templates"
  ON public.whatsapp_message_templates FOR UPDATE
  TO authenticated USING (created_by = auth.uid() OR is_manager_role(auth.uid()));

CREATE POLICY "Owner or manager can delete wa templates"
  ON public.whatsapp_message_templates FOR DELETE
  TO authenticated USING (created_by = auth.uid() OR is_manager_role(auth.uid()));

CREATE TRIGGER update_wa_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
