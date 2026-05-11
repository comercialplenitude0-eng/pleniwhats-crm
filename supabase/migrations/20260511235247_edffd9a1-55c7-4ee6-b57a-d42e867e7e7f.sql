CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  shortcut text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_templates_owner ON public.message_templates(owner_id);
CREATE INDEX idx_templates_shortcut ON public.message_templates(shortcut);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or shared templates" ON public.message_templates
FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR is_shared = true OR has_role(auth.uid(), 'gestor'));

CREATE POLICY "Insert own templates" ON public.message_templates
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Update own templates or gestor" ON public.message_templates
FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR has_role(auth.uid(), 'gestor'));

CREATE POLICY "Delete own templates or gestor" ON public.message_templates
FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR has_role(auth.uid(), 'gestor'));

CREATE TRIGGER trg_templates_updated
BEFORE UPDATE ON public.message_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();