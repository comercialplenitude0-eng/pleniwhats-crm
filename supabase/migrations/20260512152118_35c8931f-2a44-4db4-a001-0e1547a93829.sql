
CREATE TABLE public.workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  business_hours_start time NOT NULL DEFAULT '09:00',
  business_hours_end time NOT NULL DEFAULT '18:00',
  business_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  away_message text NOT NULL DEFAULT 'Olá! Estamos fora do horário de atendimento. Retornaremos em breve.',
  away_message_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE UNIQUE INDEX workspace_settings_singleton_idx ON public.workspace_settings ((singleton));
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read workspace settings"
  ON public.workspace_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only gestor can insert workspace settings"
  ON public.workspace_settings FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));
CREATE POLICY "Only gestor can update workspace settings"
  ON public.workspace_settings FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role));
INSERT INTO public.workspace_settings (singleton) VALUES (true);

CREATE TYPE public.automation_trigger AS ENUM ('no_reply', 'keyword_inbound', 'new_conversation');
CREATE TYPE public.automation_action AS ENUM ('transfer', 'set_label', 'set_status', 'send_template');

CREATE TABLE public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  trigger automation_trigger NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action automation_action NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can read rules"
  ON public.automation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestor manages rules insert"
  ON public.automation_rules FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'gestor'::app_role));
CREATE POLICY "Gestor manages rules update"
  ON public.automation_rules FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role));
CREATE POLICY "Gestor manages rules delete"
  ON public.automation_rules FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'gestor'::app_role));
CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
