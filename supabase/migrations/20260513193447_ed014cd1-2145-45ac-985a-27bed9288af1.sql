
-- =========================================
-- FASE 1: Multi-conta WhatsApp
-- =========================================

-- 1) Tabela de contas WhatsApp
CREATE TABLE IF NOT EXISTS public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  phone_number text,
  phone_number_id text NOT NULL UNIQUE,
  business_account_id text,
  access_token text,
  app_secret text,
  verify_token text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_whatsapp_accounts_updated_at
BEFORE UPDATE ON public.whatsapp_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) N:N usuário ↔ conta
CREATE TABLE IF NOT EXISTS public.user_whatsapp_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

ALTER TABLE public.user_whatsapp_access ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_uwa_user ON public.user_whatsapp_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uwa_account ON public.user_whatsapp_access(account_id);

-- 3) Helper: pode acessar conta?
CREATE OR REPLACE FUNCTION public.can_access_account(_user_id uuid, _account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'gestor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_whatsapp_access
      WHERE user_id = _user_id AND account_id = _account_id
    )
$$;

-- 4) Backfill: migrar whatsapp_settings (singleton) → whatsapp_accounts
DO $$
DECLARE
  v_settings record;
  v_new_id uuid;
BEGIN
  SELECT phone_number_id, access_token, app_secret, verify_token, business_account_id
    INTO v_settings
  FROM public.whatsapp_settings
  WHERE id = true;

  IF v_settings.phone_number_id IS NOT NULL AND v_settings.phone_number_id <> '' THEN
    -- Cria a conta migrada (se ainda não existir pelo phone_number_id)
    INSERT INTO public.whatsapp_accounts (
      display_name, phone_number_id, access_token, app_secret, verify_token, business_account_id
    )
    VALUES (
      'Conta principal',
      v_settings.phone_number_id,
      v_settings.access_token,
      v_settings.app_secret,
      v_settings.verify_token,
      v_settings.business_account_id
    )
    ON CONFLICT (phone_number_id) DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NULL THEN
      SELECT id INTO v_new_id FROM public.whatsapp_accounts
      WHERE phone_number_id = v_settings.phone_number_id;
    END IF;

    -- Todo vendedor existente recebe acesso à conta migrada
    INSERT INTO public.user_whatsapp_access (user_id, account_id)
    SELECT DISTINCT ur.user_id, v_new_id
    FROM public.user_roles ur
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 5) Adiciona account_id em conversations e messages
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

-- Backfill: associa todas as conversas/mensagens existentes à primeira conta
DO $$
DECLARE
  v_acc_id uuid;
BEGIN
  SELECT id INTO v_acc_id FROM public.whatsapp_accounts ORDER BY created_at LIMIT 1;
  IF v_acc_id IS NOT NULL THEN
    UPDATE public.conversations SET account_id = v_acc_id WHERE account_id IS NULL;
    UPDATE public.messages SET account_id = v_acc_id WHERE account_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_account ON public.conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_account ON public.messages(account_id);

-- 6) RLS policies em whatsapp_accounts
CREATE POLICY "Gestor manages whatsapp_accounts insert"
ON public.whatsapp_accounts FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestor manages whatsapp_accounts update"
ON public.whatsapp_accounts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestor manages whatsapp_accounts delete"
ON public.whatsapp_accounts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Users see accounts they can access"
ON public.whatsapp_accounts FOR SELECT TO authenticated
USING (public.can_access_account(auth.uid(), id));

-- 7) RLS em user_whatsapp_access
CREATE POLICY "Users see own access entries"
ON public.user_whatsapp_access FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestor manages access insert"
ON public.user_whatsapp_access FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestor manages access delete"
ON public.user_whatsapp_access FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'gestor'::app_role));

-- 8) Atualiza RLS de conversations: vendedor precisa ter acesso à conta também
DROP POLICY IF EXISTS "Vendedor sees own, gestor sees all (select)" ON public.conversations;
DROP POLICY IF EXISTS "Vendedor updates own, gestor updates all" ON public.conversations;
DROP POLICY IF EXISTS "Gestor inserts conversations" ON public.conversations;

CREATE POLICY "Conversations select by access"
ON public.conversations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR (
    assigned_to = auth.uid()
    AND (account_id IS NULL OR public.can_access_account(auth.uid(), account_id))
  )
  OR (
    assigned_to IS NULL
    AND account_id IS NOT NULL
    AND public.can_access_account(auth.uid(), account_id)
  )
);

CREATE POLICY "Conversations update by access"
ON public.conversations FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR (assigned_to = auth.uid())
  OR (account_id IS NOT NULL AND public.can_access_account(auth.uid(), account_id))
);

CREATE POLICY "Conversations insert by access"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR (account_id IS NOT NULL AND public.can_access_account(auth.uid(), account_id))
);
