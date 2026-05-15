DROP POLICY IF EXISTS "Admins can read app_logs" ON public.app_logs;
CREATE POLICY "Managers can read app_logs"
ON public.app_logs FOR SELECT TO authenticated
USING (is_manager_role(auth.uid()));