-- FASE 3: Tags editáveis (sistema multi-tag por conversa, 100% interno)

-- 1. Tabela de tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  emoji text,
  color text NOT NULL DEFAULT '#6366f1',
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_tags_sort ON public.tags(sort_order, name);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read tags"
  ON public.tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manager can insert tags"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_role(auth.uid()));

CREATE POLICY "Manager can update tags"
  ON public.tags FOR UPDATE TO authenticated
  USING (public.is_manager_role(auth.uid()));

CREATE POLICY "Manager can delete non-system tags"
  ON public.tags FOR DELETE TO authenticated
  USING (public.is_manager_role(auth.uid()) AND is_system = false);

CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Tabela de junção conversation_tags
CREATE TABLE public.conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, tag_id)
);

CREATE INDEX idx_conversation_tags_conv ON public.conversation_tags(conversation_id);
CREATE INDEX idx_conversation_tags_tag ON public.conversation_tags(tag_id);

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tags select via conversation access"
  ON public.conversation_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_tags.conversation_id
      AND (
        public.is_manager_role(auth.uid())
        OR c.assigned_to = auth.uid()
        OR (c.account_id IS NOT NULL AND public.can_access_account(auth.uid(), c.account_id))
      )
  ));

CREATE POLICY "Tags insert via conversation access"
  ON public.conversation_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_tags.conversation_id
      AND (
        public.is_manager_role(auth.uid())
        OR c.assigned_to = auth.uid()
        OR (c.account_id IS NOT NULL AND public.can_access_account(auth.uid(), c.account_id))
      )
  ));

CREATE POLICY "Tags delete via conversation access"
  ON public.conversation_tags FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_tags.conversation_id
      AND (
        public.is_manager_role(auth.uid())
        OR c.assigned_to = auth.uid()
        OR (c.account_id IS NOT NULL AND public.can_access_account(auth.uid(), c.account_id))
      )
  ));

-- 3. Seed inicial: criar tags equivalentes às labels do enum legacy + mapear conversas existentes
INSERT INTO public.tags (name, slug, emoji, color, sort_order, is_system) VALUES
  ('Quente', 'hot', '🔥', '#ef4444', 10, true),
  ('Morno', 'warm', '🌤️', '#f59e0b', 20, true),
  ('Frio', 'cold', '❄️', '#3b82f6', 30, true),
  ('Novo', 'new', '🆕', '#10b981', 40, true),
  ('Fechado', 'closed', '✅', '#6b7280', 50, true)
ON CONFLICT (slug) DO NOTHING;

-- Backfill: associar todas as conversas existentes às tags equivalentes ao seu label atual
INSERT INTO public.conversation_tags (conversation_id, tag_id)
SELECT c.id, t.id
FROM public.conversations c
JOIN public.tags t ON t.slug = c.label::text
ON CONFLICT DO NOTHING;

-- 4. Activity log: trigger para registrar mudanças de tags
CREATE OR REPLACE FUNCTION public.log_tag_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tag_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO tag_name FROM public.tags WHERE id = NEW.tag_id;
    INSERT INTO public.conversation_activity (conversation_id, user_id, kind, payload)
    VALUES (NEW.conversation_id, auth.uid(), 'tag_added',
            jsonb_build_object('tag_id', NEW.tag_id, 'tag_name', tag_name));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO tag_name FROM public.tags WHERE id = OLD.tag_id;
    INSERT INTO public.conversation_activity (conversation_id, user_id, kind, payload)
    VALUES (OLD.conversation_id, auth.uid(), 'tag_removed',
            jsonb_build_object('tag_id', OLD.tag_id, 'tag_name', tag_name));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_conversation_tags_log
  AFTER INSERT OR DELETE ON public.conversation_tags
  FOR EACH ROW EXECUTE FUNCTION public.log_tag_change();