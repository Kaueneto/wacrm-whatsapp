ALTER FUNCTION public.dashboard_overview(integer, text) RENAME TO dashboard_admin_overview_data;
REVOKE ALL ON FUNCTION public.dashboard_admin_overview_data(integer, text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.dashboard_overview(p_days integer, p_tz text DEFAULT 'UTC')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND account_role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only administrators can view the account overview' USING ERRCODE = '42501';
  END IF;
  RETURN public.dashboard_admin_overview_data(p_days, p_tz);
END;
$$;
REVOKE ALL ON FUNCTION public.dashboard_overview(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_overview(integer, text) TO authenticated;
