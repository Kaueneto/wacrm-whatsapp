CREATE FUNCTION public.broadcast_cost_breakdown(
  p_start timestamptz, p_end timestamptz, p_time_zone text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_account uuid;
  v_role public.account_role_enum;
BEGIN
  SELECT p.account_id, p.account_role INTO v_account, v_role
  FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_account IS NULL OR v_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'Supervisor access is required' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_end - p_start > interval '32 days'
     OR p_time_zone IS NULL THEN
    RAISE EXCEPTION 'Invalid usage period' USING ERRCODE = '22023';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(usage))
    FROM (
      SELECT (coalesce(r.delivered_at, r.read_at) AT TIME ZONE p_time_zone)::date AS day,
             b.department_id, d.name AS department_name, b.campaign_id, c.name AS campaign_name,
             j.phone_number_id, upper(j.template_snapshot->>'category') AS category,
             count(*) AS delivered
      FROM public.broadcasts b
      JOIN public.broadcast_recipients r ON r.broadcast_id = b.id
      LEFT JOIN public.broadcast_jobs j ON j.broadcast_id = b.id AND j.account_id = b.account_id
      LEFT JOIN public.departments d ON d.id = b.department_id AND d.account_id = b.account_id
      LEFT JOIN public.campaigns c ON c.id = b.campaign_id AND c.account_id = b.account_id
      WHERE b.account_id = v_account AND (
        v_role IN ('owner', 'admin') OR b.department_id IN (
          SELECT t.department_id
          FROM public.team_members m
          JOIN public.teams t ON t.id = m.team_id AND t.account_id = m.account_id
          WHERE m.account_id = v_account AND m.user_id = auth.uid()
        )
      )
      AND r.status IN ('delivered', 'read', 'replied')
      AND coalesce(r.delivered_at, r.read_at) >= p_start
      AND coalesce(r.delivered_at, r.read_at) < p_end
      GROUP BY 1, b.department_id, d.name, b.campaign_id, c.name, j.phone_number_id,
        upper(j.template_snapshot->>'category')
    ) AS usage
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_cost_breakdown(timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broadcast_cost_breakdown(timestamptz, timestamptz, text) TO authenticated;
