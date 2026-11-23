CREATE FUNCTION public.support_supervisor_overview(p_account uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  overview jsonb;
BEGIN
  IF NOT public.is_account_member(p_account, 'supervisor') THEN
    RAISE EXCEPTION 'Supervisor access is required' USING ERRCODE = '42501';
  END IF;

  WITH visible AS MATERIALIZED (
    SELECT c.id, c.team_id, c.assigned_agent_id, c.contact_id, c.status,
           c.last_inbound_at, c.last_message_at, c.created_at,
           c.status <> 'closed' AND c.last_inbound_at IS NOT NULL
             AND (c.last_reply_at IS NULL OR c.last_reply_at < c.last_inbound_at) AS waiting
    FROM public.conversations c
    WHERE c.account_id = p_account
  ), counts AS (
    SELECT team_id, grouping(team_id) AS total,
           count(*) FILTER (WHERE status = 'open') AS open,
           count(*) FILTER (WHERE status = 'pending') AS pending,
           count(*) FILTER (WHERE status = 'closed') AS closed,
           count(*) FILTER (WHERE status <> 'closed' AND assigned_agent_id IS NULL) AS unassigned,
           count(*) FILTER (WHERE waiting) AS waiting
    FROM visible
    GROUP BY GROUPING SETS ((), (team_id))
  ), queues AS (
    SELECT t.id, t.name AS team, d.name AS department,
           coalesce(c.open, 0) AS open, coalesce(c.pending, 0) AS pending,
           coalesce(c.closed, 0) AS closed, coalesce(c.unassigned, 0) AS unassigned,
           coalesce(c.waiting, 0) AS waiting
    FROM public.teams t
    JOIN public.departments d ON d.id = t.department_id AND d.account_id = t.account_id
    LEFT JOIN counts c ON c.team_id = t.id AND c.total = 0
    WHERE t.account_id = p_account
  ), attention AS (
    SELECT v.id, v.status, v.waiting,
           CASE WHEN v.waiting THEN v.last_inbound_at END AS waiting_since,
           coalesce(v.last_message_at, v.created_at) AS activity_at,
           coalesce(nullif(btrim(contact.name), ''), nullif(contact.phone, '')) AS contact,
           t.name AS team, nullif(btrim(p.full_name), '') AS assignee
    FROM visible v
    LEFT JOIN public.contacts contact ON contact.id = v.contact_id
    LEFT JOIN public.teams t ON t.id = v.team_id
    LEFT JOIN public.profiles p ON p.user_id = v.assigned_agent_id AND p.account_id = p_account
    WHERE v.status <> 'closed'
    ORDER BY waiting_since ASC NULLS LAST, activity_at DESC, v.id
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'counts', to_jsonb(c) - 'team_id' - 'total',
    'teams', coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.department, q.team) FROM queues q), '[]'::jsonb),
    'attention', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.waiting_since ASC NULLS LAST, a.activity_at DESC, a.id) FROM attention a), '[]'::jsonb)
  ) INTO overview
  FROM counts c WHERE c.total = 1;

  RETURN overview;
END;
$$;

REVOKE ALL ON FUNCTION public.support_supervisor_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_supervisor_overview(uuid) TO authenticated;
