
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.update_presence()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.team_overview()
RETURNS TABLE (
  user_id uuid,
  convs_count int,
  closed_count int,
  last_seen_at timestamptz,
  last_outbound_at timestamptz,
  avg_response_seconds numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH conv_stats AS (
    SELECT assigned_to AS uid,
           COUNT(*) AS total_count,
           COUNT(*) FILTER (WHERE status = 'encerrada') AS closed_count
    FROM public.conversations
    WHERE assigned_to IS NOT NULL
    GROUP BY assigned_to
  ),
  last_out AS (
    SELECT sender_id AS uid, MAX(created_at) AS last_outbound_at
    FROM public.messages
    WHERE direction = 'outbound' AND sender_id IS NOT NULL
    GROUP BY sender_id
  ),
  pairs AS (
    SELECT m.sender_id AS uid,
           EXTRACT(EPOCH FROM (m.created_at - prev_in.created_at)) AS gap
    FROM public.messages m
    JOIN LATERAL (
      SELECT created_at FROM public.messages mi
      WHERE mi.conversation_id = m.conversation_id
        AND mi.direction = 'inbound'
        AND mi.created_at < m.created_at
      ORDER BY mi.created_at DESC
      LIMIT 1
    ) prev_in ON TRUE
    WHERE m.direction = 'outbound'
      AND m.sender_id IS NOT NULL
      AND m.created_at > now() - interval '30 days'
  ),
  resp AS (
    SELECT uid, AVG(gap) AS avg_response_seconds
    FROM pairs
    WHERE gap > 0 AND gap < 86400
    GROUP BY uid
  )
  SELECT
    p.id AS user_id,
    COALESCE(c.total_count, 0)::int AS convs_count,
    COALESCE(c.closed_count, 0)::int AS closed_count,
    p.last_seen_at,
    l.last_outbound_at,
    r.avg_response_seconds
  FROM public.profiles p
  LEFT JOIN conv_stats c ON c.uid = p.id
  LEFT JOIN last_out l ON l.uid = p.id
  LEFT JOIN resp r ON r.uid = p.id;
$$;
