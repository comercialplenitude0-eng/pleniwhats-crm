-- FASE 4: Tabela contacts separada (canônica), mantendo legacy fields em conversations sincronizados

-- 1. Tabela contacts
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text NOT NULL,
  avatar_url text,
  email text,
  wa_contact_id text,
  notes text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_name ON public.contacts(name);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read contacts"
  ON public.contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manager can insert contacts"
  ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_role(auth.uid()));

CREATE POLICY "Manager can update contacts"
  ON public.contacts FOR UPDATE TO authenticated
  USING (public.is_manager_role(auth.uid()));

CREATE POLICY "Manager can delete contacts"
  ON public.contacts FOR DELETE TO authenticated
  USING (public.is_manager_role(auth.uid()));

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Adicionar contact_id em conversations (FK opcional, populado por trigger)
ALTER TABLE public.conversations
  ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_conversations_contact ON public.conversations(contact_id);

-- 3. Backfill: criar um contato por phone distinto, escolhendo o nome mais recente
INSERT INTO public.contacts (phone, name, avatar_url, wa_contact_id)
SELECT DISTINCT ON (contact_phone)
  contact_phone,
  contact_name,
  contact_avatar,
  wa_contact_id
FROM public.conversations
WHERE contact_phone IS NOT NULL
ORDER BY contact_phone, last_message_at DESC NULLS LAST
ON CONFLICT (phone) DO NOTHING;

-- Linkar conversations ao contact criado
UPDATE public.conversations c
SET contact_id = ct.id
FROM public.contacts ct
WHERE c.contact_id IS NULL AND c.contact_phone = ct.phone;

-- 4. Trigger BEFORE INSERT/UPDATE em conversations:
--    se contact_id é null e há contact_phone, find-or-create contact e setar.
CREATE OR REPLACE FUNCTION public.ensure_conversation_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  found_id uuid;
BEGIN
  IF NEW.contact_id IS NULL AND NEW.contact_phone IS NOT NULL THEN
    SELECT id INTO found_id FROM public.contacts WHERE phone = NEW.contact_phone LIMIT 1;
    IF found_id IS NULL THEN
      INSERT INTO public.contacts (phone, name, avatar_url, wa_contact_id)
      VALUES (
        NEW.contact_phone,
        COALESCE(NEW.contact_name, NEW.contact_phone),
        NEW.contact_avatar,
        NEW.wa_contact_id
      )
      RETURNING id INTO found_id;
    END IF;
    NEW.contact_id := found_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conversations_ensure_contact
  BEFORE INSERT OR UPDATE OF contact_phone, contact_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.ensure_conversation_contact();

-- 5. Trigger AFTER UPDATE em contacts: propagar nome/avatar/wa_contact_id para conversations
CREATE OR REPLACE FUNCTION public.sync_contact_to_conversations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.wa_contact_id IS DISTINCT FROM OLD.wa_contact_id
     OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    UPDATE public.conversations
    SET contact_name = NEW.name,
        contact_avatar = NEW.avatar_url,
        wa_contact_id = NEW.wa_contact_id,
        contact_phone = NEW.phone
    WHERE contact_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contacts_sync_conversations
  AFTER UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_contact_to_conversations();