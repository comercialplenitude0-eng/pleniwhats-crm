-- Notes table
CREATE TABLE public.conversation_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notes select via conversation access"
ON public.conversation_notes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_notes.conversation_id
    AND (public.has_role(auth.uid(), 'gestor'::app_role) OR c.assigned_to = auth.uid())
));

CREATE POLICY "Notes insert via conversation access"
ON public.conversation_notes FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_notes.conversation_id
      AND (public.has_role(auth.uid(), 'gestor'::app_role) OR c.assigned_to = auth.uid())
  )
);

CREATE POLICY "Notes update own or gestor"
ON public.conversation_notes FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Notes delete own or gestor"
ON public.conversation_notes FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

CREATE TRIGGER trg_conversation_notes_updated_at
BEFORE UPDATE ON public.conversation_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_conversation_notes_conversation ON public.conversation_notes(conversation_id, created_at DESC);

-- Activity timeline
CREATE TABLE public.conversation_activity (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  user_id UUID,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity select via conversation access"
ON public.conversation_activity FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_activity.conversation_id
    AND (public.has_role(auth.uid(), 'gestor'::app_role) OR c.assigned_to = auth.uid())
));

CREATE INDEX idx_conversation_activity_conversation ON public.conversation_activity(conversation_id, created_at DESC);

-- Trigger: log conversation field changes
CREATE OR REPLACE FUNCTION public.log_conversation_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.label IS DISTINCT FROM OLD.label THEN
    INSERT INTO public.conversation_activity (conversation_id, user_id, kind, payload)
    VALUES (NEW.id, auth.uid(), 'label_changed',
            jsonb_build_object('from', OLD.label, 'to', NEW.label));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.conversation_activity (conversation_id, user_id, kind, payload)
    VALUES (NEW.id, auth.uid(), 'status_changed',
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.conversation_activity (conversation_id, user_id, kind, payload)
    VALUES (NEW.id, auth.uid(), 'assigned_changed',
            jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_conversation_changes
AFTER UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.log_conversation_changes();

-- Trigger: log note creation
CREATE OR REPLACE FUNCTION public.log_note_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.conversation_activity (conversation_id, user_id, kind, payload)
  VALUES (NEW.conversation_id, NEW.user_id, 'note_created',
          jsonb_build_object('note_id', NEW.id, 'preview', left(NEW.body, 120)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_note_created
AFTER INSERT ON public.conversation_notes
FOR EACH ROW EXECUTE FUNCTION public.log_note_created();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_activity;