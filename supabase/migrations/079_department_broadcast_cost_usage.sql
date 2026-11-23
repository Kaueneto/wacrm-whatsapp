CREATE FUNCTION public.department_broadcast_cost_usage(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (phone_number_id text, category text, delivered bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_account uuid;
BEGIN
  SELECT p.account_id INTO v_account FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.account_role = 'supervisor';
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Supervisor access is required' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_end - p_start > interval '32 days' THEN
    RAISE EXCEPTION 'Invalid usage period' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT j.phone_number_id, upper(j.template_snapshot->>'category'), count(*)
  FROM public.broadcasts b
  LEFT JOIN public.broadcast_jobs j ON j.broadcast_id = b.id AND j.account_id = b.account_id
  JOIN public.broadcast_recipients r ON r.broadcast_id = b.id
  WHERE b.account_id = v_account
    AND b.department_id IN (
      SELECT t.department_id
      FROM public.team_members m
      JOIN public.teams t ON t.id = m.team_id AND t.account_id = m.account_id
      WHERE m.account_id = v_account AND m.user_id = auth.uid()
    )
    AND r.status IN ('delivered', 'read', 'replied')
    AND coalesce(r.delivered_at, r.read_at) >= p_start
    AND coalesce(r.delivered_at, r.read_at) < p_end
  GROUP BY j.phone_number_id, upper(j.template_snapshot->>'category');
END;
$$;
REVOKE ALL ON FUNCTION public.department_broadcast_cost_usage(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.department_broadcast_cost_usage(timestamptz, timestamptz) TO authenticated;
