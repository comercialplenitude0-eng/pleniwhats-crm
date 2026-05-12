CREATE POLICY "Activity insert via conversation access"
ON public.conversation_activity
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid() OR user_id IS NULL)
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_activity.conversation_id
      AND (public.has_role(auth.uid(), 'gestor'::public.app_role) OR c.assigned_to = auth.uid())
  )
);