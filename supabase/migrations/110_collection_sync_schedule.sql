-- Calendar recurrence is calculated by the application; only the worker claims due jobs.
ALTER TABLE public.collection_portfolio_settings
  ADD COLUMN schedule_next_at timestamptz,
  ADD COLUMN schedule_lease uuid,
  ADD COLUMN schedule_lease_until timestamptz,
  ADD COLUMN schedule_error text;
CREATE INDEX collection_schedule_due ON public.collection_portfolio_settings(schedule_next_at)
  WHERE setup->'schedule'->>'enabled' = 'true';

CREATE FUNCTION public.claim_collection_schedule()
RETURNS SETOF public.collection_portfolio_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid;
BEGIN
  SELECT s.account_id INTO target FROM collection_portfolio_settings s
  WHERE s.setup->'schedule'->>'enabled' = 'true'
    AND s.schedule_next_at <= now()
    AND (s.schedule_lease_until IS NULL OR s.schedule_lease_until <= now())
    AND NOT EXISTS (SELECT 1 FROM collection_sync_runs r
      WHERE r.account_id=s.account_id AND r.state='running' AND r.expires_at>now())
  ORDER BY s.schedule_next_at FOR UPDATE OF s SKIP LOCKED LIMIT 1;
  IF target IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE collection_portfolio_settings SET
    schedule_lease=gen_random_uuid(), schedule_lease_until=now()+interval '30 minutes'
    WHERE account_id=target RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.claim_collection_schedule() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_collection_schedule() TO service_role;
COMMENT ON TABLE public.collection_portfolio_settings IS
  'Organization portfolio setup and optional sync recurrence. Automatic imports require the collections worker. No messages are sent.';
