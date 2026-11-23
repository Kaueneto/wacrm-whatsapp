ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS started_at timestamptz;

UPDATE public.broadcasts b
SET started_at = first_send.started_at
FROM (
  SELECT broadcast_id, MIN(LEAST(accepted_at, sent_at)) AS started_at
  FROM public.broadcast_recipients
  WHERE accepted_at IS NOT NULL OR sent_at IS NOT NULL
  GROUP BY broadcast_id
) first_send
WHERE first_send.broadcast_id = b.id AND b.started_at IS NULL;

CREATE FUNCTION public.mark_broadcast_started() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE execution_start timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'broadcast_jobs' THEN
    execution_start := now();
  ELSE
    execution_start := LEAST(NEW.accepted_at, NEW.sent_at);
  END IF;
  IF execution_start IS NOT NULL THEN
    UPDATE broadcasts SET started_at = execution_start
    WHERE id = NEW.broadcast_id AND started_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER broadcast_job_started AFTER UPDATE OF state ON public.broadcast_jobs
FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'running')
EXECUTE FUNCTION public.mark_broadcast_started();

CREATE TRIGGER broadcast_recipient_started AFTER INSERT OR UPDATE OF sent_at, accepted_at ON public.broadcast_recipients
FOR EACH ROW WHEN (NEW.sent_at IS NOT NULL OR NEW.accepted_at IS NOT NULL)
EXECUTE FUNCTION public.mark_broadcast_started();

CREATE FUNCTION public.record_broadcast_reply(
  p_account uuid, p_contact uuid, p_at timestamptz, p_phone_variants text[],
  p_sender text DEFAULT NULL, p_reply_to text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql SET search_path = public AS $$
  WITH matching_contacts AS (
    SELECT id FROM contacts WHERE account_id = p_account
    AND (id = p_contact OR phone_normalized = ANY(p_phone_variants))
  ), latest AS (
    SELECT r.id
    FROM broadcast_recipients r
    JOIN broadcasts b ON b.id = r.broadcast_id
    LEFT JOIN broadcast_jobs job ON job.broadcast_id = r.broadcast_id
    WHERE b.account_id = p_account
      AND (p_sender IS NULL OR job.phone_number_id = p_sender OR job.broadcast_id IS NULL)
      AND (r.status IN ('sent', 'delivered', 'read', 'replied') OR (r.status = 'pending' AND r.accepted_at IS NOT NULL))
      AND COALESCE(r.sent_at, r.accepted_at) BETWEEN p_at - INTERVAL '7 days' AND p_at
      AND CASE WHEN p_reply_to IS NOT NULL THEN r.whatsapp_message_id = p_reply_to
               ELSE r.contact_id IN (SELECT id FROM matching_contacts) END
    ORDER BY COALESCE(r.sent_at, r.accepted_at) DESC, r.created_at DESC, r.id
    LIMIT 1
  )
  UPDATE broadcast_recipients SET status = 'replied', replied_at = p_at
  WHERE id = (SELECT id FROM latest)
    AND (status IN ('sent', 'delivered', 'read') OR (status = 'pending' AND accepted_at IS NOT NULL))
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.record_broadcast_reply(uuid, uuid, timestamptz, text[], text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_broadcast_reply(uuid, uuid, timestamptz, text[], text, text) TO service_role;
