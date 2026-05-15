
-- Phase 5 + media lazy completion

-- 1) app_logs table
CREATE TABLE public.app_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL DEFAULT 'info',
  source text NOT NULL,
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX app_logs_created_idx ON public.app_logs (created_at DESC);
CREATE INDEX app_logs_level_source_idx ON public.app_logs (level, source, created_at DESC);

ALTER TABLE public.app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app_logs"
  ON public.app_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- No client INSERT/UPDATE/DELETE policies — only server (admin client) writes.

-- 2) media_download_queue (separate from outbound_queue)
CREATE TABLE public.media_download_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  account_id uuid,
  media_id text NOT NULL,
  media_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz
);

CREATE INDEX media_download_queue_status_idx
  ON public.media_download_queue (status, next_attempt_at)
  WHERE status IN ('queued','failed');

ALTER TABLE public.media_download_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manager read media_download_queue"
  ON public.media_download_queue FOR SELECT
  TO authenticated
  USING (is_manager_role(auth.uid()));

-- 3) Fix race condition in claim_gestor_if_none
CREATE OR REPLACE FUNCTION public.claim_gestor_if_none()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  has_any_manager boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  -- Lock the table to prevent two simultaneous signups both claiming gestor
  LOCK TABLE public.user_roles IN EXCLUSIVE MODE;

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
$function$;

-- 4) Retention: delete app_logs older than 30 days (cron)
SELECT cron.schedule(
  'cleanup-app-logs',
  '0 3 * * *',
  $$ DELETE FROM public.app_logs WHERE created_at < now() - interval '30 days' $$
);

-- 5) Cron for media download processor (every 1 min)
SELECT cron.schedule(
  'process-media-download-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--18592915-259a-4823-87c2-b9c69c731a22.lovable.app/api/public/hooks/process-media-queue',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzdWplbmxjaGp6eHNlZWNkdW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTMyOTYsImV4cCI6MjA5NDA4OTI5Nn0.swhM0nmlGy6dxRriJCIFtGecfsvGaMi4ZKeG7kTG6Ys'
    ),
    body := '{}'::jsonb
  );
  $$
);
