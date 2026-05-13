-- FASE 2 (parte 2): helpers, RLS e backfill

-- Helper: papel de gerente (admin OU gestor)
CREATE OR REPLACE FUNCTION public.is_manager_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::app_role, 'gestor'::app_role)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_manager_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager_role(uuid) TO authenticated;

-- Atualizar can_access_account: gerentes (admin/gestor) têm acesso total
CREATE OR REPLACE FUNCTION public.can_access_account(_user_id uuid, _account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_manager_role(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_whatsapp_access
      WHERE user_id = _user_id AND account_id = _account_id
    )
$$;

-- Backfill: todo 'vendedor' existente vira 'comercial' também
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'comercial'::app_role
FROM public.user_roles
WHERE role = 'vendedor'::app_role
ON CONFLICT DO NOTHING;

-- Remover linhas 'vendedor' duplicadas (já temos comercial)
DELETE FROM public.user_roles ur
WHERE role = 'vendedor'::app_role
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'comercial'::app_role
  );

-- handle_new_user agora cria 'comercial' por padrão
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'comercial');
  RETURN NEW;
END;
$$;

-- Atualizar todas as políticas RLS que usavam apenas 'gestor' para aceitar admin também

-- conversation_activity
DROP POLICY IF EXISTS "Activity insert via conversation access" ON public.conversation_activity;
CREATE POLICY "Activity insert via conversation access"
ON public.conversation_activity FOR INSERT TO authenticated
WITH CHECK (
  ((user_id = auth.uid()) OR (user_id IS NULL))
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_activity.conversation_id
      AND (public.is_manager_role(auth.uid()) OR c.assigned_to = auth.uid())
  )
);

DROP POLICY IF EXISTS "Activity select via conversation access" ON public.conversation_activity;
CREATE POLICY "Activity select via conversation access"
ON public.conversation_activity FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_activity.conversation_id
      AND (public.is_manager_role(auth.uid()) OR c.assigned_to = auth.uid())
  )
);

-- conversation_notes
DROP POLICY IF EXISTS "Notes delete own or gestor" ON public.conversation_notes;
CREATE POLICY "Notes delete own or manager"
ON public.conversation_notes FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Notes update own or gestor" ON public.conversation_notes;
CREATE POLICY "Notes update own or manager"
ON public.conversation_notes FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Notes insert via conversation access" ON public.conversation_notes;
CREATE POLICY "Notes insert via conversation access"
ON public.conversation_notes FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_notes.conversation_id
      AND (public.is_manager_role(auth.uid()) OR c.assigned_to = auth.uid())
  )
);

DROP POLICY IF EXISTS "Notes select via conversation access" ON public.conversation_notes;
CREATE POLICY "Notes select via conversation access"
ON public.conversation_notes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_notes.conversation_id
      AND (public.is_manager_role(auth.uid()) OR c.assigned_to = auth.uid())
  )
);

-- conversations
DROP POLICY IF EXISTS "Conversations insert by access" ON public.conversations;
CREATE POLICY "Conversations insert by access"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (
  public.is_manager_role(auth.uid())
  OR (account_id IS NOT NULL AND public.can_access_account(auth.uid(), account_id))
);

DROP POLICY IF EXISTS "Conversations select by access" ON public.conversations;
CREATE POLICY "Conversations select by access"
ON public.conversations FOR SELECT TO authenticated
USING (
  public.is_manager_role(auth.uid())
  OR (assigned_to = auth.uid() AND (account_id IS NULL OR public.can_access_account(auth.uid(), account_id)))
  OR (assigned_to IS NULL AND account_id IS NOT NULL AND public.can_access_account(auth.uid(), account_id))
);

DROP POLICY IF EXISTS "Conversations update by access" ON public.conversations;
CREATE POLICY "Conversations update by access"
ON public.conversations FOR UPDATE TO authenticated
USING (
  public.is_manager_role(auth.uid())
  OR assigned_to = auth.uid()
  OR (account_id IS NOT NULL AND public.can_access_account(auth.uid(), account_id))
);

-- messages
DROP POLICY IF EXISTS "Messages insert via conversation access" ON public.messages;
CREATE POLICY "Messages insert via conversation access"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (public.is_manager_role(auth.uid()) OR c.assigned_to = auth.uid())
  )
);

DROP POLICY IF EXISTS "Messages select via conversation access" ON public.messages;
CREATE POLICY "Messages select via conversation access"
ON public.messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (public.is_manager_role(auth.uid()) OR c.assigned_to = auth.uid())
  )
);

-- message_templates
DROP POLICY IF EXISTS "Delete own templates or gestor" ON public.message_templates;
CREATE POLICY "Delete own templates or manager"
ON public.message_templates FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Update own templates or gestor" ON public.message_templates;
CREATE POLICY "Update own templates or manager"
ON public.message_templates FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "View own or shared templates" ON public.message_templates;
CREATE POLICY "View own or shared templates"
ON public.message_templates FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR is_shared = true OR public.is_manager_role(auth.uid()));

-- automation_rules
DROP POLICY IF EXISTS "Gestor manages rules delete" ON public.automation_rules;
CREATE POLICY "Manager manages rules delete"
ON public.automation_rules FOR DELETE TO authenticated
USING (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor manages rules insert" ON public.automation_rules;
CREATE POLICY "Manager manages rules insert"
ON public.automation_rules FOR INSERT TO authenticated
WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor manages rules update" ON public.automation_rules;
CREATE POLICY "Manager manages rules update"
ON public.automation_rules FOR UPDATE TO authenticated
USING (public.is_manager_role(auth.uid()));

-- campaigns
DROP POLICY IF EXISTS "Gestor delete campaigns" ON public.campaigns;
CREATE POLICY "Manager delete campaigns"
ON public.campaigns FOR DELETE TO authenticated
USING (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor insert campaigns" ON public.campaigns;
CREATE POLICY "Manager insert campaigns"
ON public.campaigns FOR INSERT TO authenticated
WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor update campaigns" ON public.campaigns;
CREATE POLICY "Manager update campaigns"
ON public.campaigns FOR UPDATE TO authenticated
USING (public.is_manager_role(auth.uid()));

-- alert_settings
DROP POLICY IF EXISTS "Only gestor can insert alert settings" ON public.alert_settings;
CREATE POLICY "Only manager can insert alert settings"
ON public.alert_settings FOR INSERT TO authenticated
WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Only gestor can update alert settings" ON public.alert_settings;
CREATE POLICY "Only manager can update alert settings"
ON public.alert_settings FOR UPDATE TO authenticated
USING (public.is_manager_role(auth.uid()));

-- workspace_settings
DROP POLICY IF EXISTS "Only gestor can insert workspace settings" ON public.workspace_settings;
CREATE POLICY "Only manager can insert workspace settings"
ON public.workspace_settings FOR INSERT TO authenticated
WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Only gestor can update workspace settings" ON public.workspace_settings;
CREATE POLICY "Only manager can update workspace settings"
ON public.workspace_settings FOR UPDATE TO authenticated
USING (public.is_manager_role(auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "Gestor manages roles delete" ON public.user_roles;
CREATE POLICY "Manager manages roles delete"
ON public.user_roles FOR DELETE TO authenticated
USING (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor manages roles insert" ON public.user_roles;
CREATE POLICY "Manager manages roles insert"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor manages roles update" ON public.user_roles;
CREATE POLICY "Manager manages roles update"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.is_manager_role(auth.uid()));

-- whatsapp_accounts
DROP POLICY IF EXISTS "Gestor manages whatsapp_accounts delete" ON public.whatsapp_accounts;
CREATE POLICY "Manager manages whatsapp_accounts delete"
ON public.whatsapp_accounts FOR DELETE TO authenticated
USING (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor manages whatsapp_accounts insert" ON public.whatsapp_accounts;
CREATE POLICY "Manager manages whatsapp_accounts insert"
ON public.whatsapp_accounts FOR INSERT TO authenticated
WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor manages whatsapp_accounts update" ON public.whatsapp_accounts;
CREATE POLICY "Manager manages whatsapp_accounts update"
ON public.whatsapp_accounts FOR UPDATE TO authenticated
USING (public.is_manager_role(auth.uid()))
WITH CHECK (public.is_manager_role(auth.uid()));

-- user_whatsapp_access
DROP POLICY IF EXISTS "Gestor manages access delete" ON public.user_whatsapp_access;
CREATE POLICY "Manager manages access delete"
ON public.user_whatsapp_access FOR DELETE TO authenticated
USING (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Gestor manages access insert" ON public.user_whatsapp_access;
CREATE POLICY "Manager manages access insert"
ON public.user_whatsapp_access FOR INSERT TO authenticated
WITH CHECK (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "Users see own access entries" ON public.user_whatsapp_access;
CREATE POLICY "Users see own access entries"
ON public.user_whatsapp_access FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_manager_role(auth.uid()));

-- whatsapp_settings (legacy)
DROP POLICY IF EXISTS "gestor select whatsapp_settings" ON public.whatsapp_settings;
CREATE POLICY "manager select whatsapp_settings"
ON public.whatsapp_settings FOR SELECT TO authenticated
USING (public.is_manager_role(auth.uid()));

DROP POLICY IF EXISTS "gestor update whatsapp_settings" ON public.whatsapp_settings;
CREATE POLICY "manager update whatsapp_settings"
ON public.whatsapp_settings FOR UPDATE TO authenticated
USING (public.is_manager_role(auth.uid()))
WITH CHECK (public.is_manager_role(auth.uid()));

-- claim_gestor_if_none: também conta admins existentes
CREATE OR REPLACE FUNCTION public.claim_gestor_if_none()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  has_any_manager boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE role IN ('gestor'::app_role, 'admin'::app_role)
  ) INTO has_any_manager;
  IF has_any_manager THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'gestor')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;