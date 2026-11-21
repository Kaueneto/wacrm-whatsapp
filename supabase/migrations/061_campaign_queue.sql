-- Durable delivery. No existing broadcasts are automatically enqueued.
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS parent_broadcast_id uuid REFERENCES public.broadcasts(id);
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS request_key uuid;
ALTER TABLE public.broadcasts DROP CONSTRAINT broadcasts_status_check;
ALTER TABLE public.broadcasts ADD CONSTRAINT broadcasts_status_check CHECK(status IN ('draft','scheduled','sending','sent','failed','completed','cancelled'));
CREATE UNIQUE INDEX broadcasts_request_key ON public.broadcasts(account_id,request_key) WHERE request_key IS NOT NULL;
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS phone_snapshot text;
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS name_snapshot text;
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS dispatch_state text;
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS dispatch_lease uuid;
ALTER TABLE public.broadcast_recipients ADD COLUMN IF NOT EXISTS dispatch_lease_until timestamptz;
ALTER TABLE public.broadcast_recipients ADD CONSTRAINT broadcast_dispatch_state_check
  CHECK (dispatch_state IN ('queued','sending','accepted','failed','unknown','cancelled'));
CREATE INDEX broadcast_queue_pending ON public.broadcast_recipients(broadcast_id,next_attempt_at,id)
  WHERE dispatch_state = 'queued';

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  definition jsonb NOT NULL,
  schedule jsonb NOT NULL,
  active boolean NOT NULL DEFAULT false,
  next_run_at timestamptz,
  scheduler_lease uuid,
  scheduler_lease_until timestamptz,
  last_error text,
  last_scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.broadcasts ADD CONSTRAINT broadcasts_campaign_fk FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);
CREATE TABLE public.broadcast_jobs (
  broadcast_id uuid PRIMARY KEY REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  phone_number_id text NOT NULL,
  waba_id text NOT NULL,
  template_snapshot jsonb NOT NULL,
  header_media_url text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','paused','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE public.broadcast_sender_slots (
  phone_number_id text PRIMARY KEY,
  next_available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now(),
  lease uuid,
  interval_ms integer NOT NULL DEFAULT 1000 CHECK (interval_ms >= 100),
  blocked_until timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.broadcast_status_events (
  message_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','delivered','read','failed')),
  occurred_at timestamptz NOT NULL,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id,status)
);
CREATE TABLE public.campaign_worker_heartbeats (
  id text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_sender_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_worker_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_read ON public.campaigns FOR SELECT TO authenticated USING (public.is_account_member(account_id));
CREATE POLICY jobs_read ON public.broadcast_jobs FOR SELECT TO authenticated USING (public.is_account_member(account_id));
GRANT SELECT ON public.campaigns,public.broadcast_jobs TO authenticated;
GRANT ALL ON public.campaigns,public.broadcast_jobs,public.broadcast_sender_slots,public.broadcast_status_events,public.campaign_worker_heartbeats TO service_role;

CREATE FUNCTION public.enqueue_broadcast(p_account uuid,p_user uuid,p_name text,p_template jsonb,
 p_phone text,p_waba text,p_recipients jsonb,p_audience jsonb DEFAULT '{}',p_variables jsonb DEFAULT '{}',
 p_media text DEFAULT NULL,p_campaign uuid DEFAULT NULL,p_parent uuid DEFAULT NULL,
 p_schedule_lease uuid DEFAULT NULL,p_next_run timestamptz DEFAULT NULL,p_request uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bid uuid;
BEGIN
  IF p_request IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||p_request::text,0));
    SELECT id INTO bid FROM broadcasts WHERE account_id=p_account AND request_key=p_request;
    IF FOUND THEN RETURN bid; END IF;
  END IF;
  IF jsonb_array_length(p_recipients) = 0 THEN RAISE EXCEPTION 'No recipients'; END IF;
  IF p_campaign IS NOT NULL THEN
    PERFORM 1 FROM campaigns WHERE id=p_campaign AND account_id=p_account FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
    IF EXISTS(SELECT 1 FROM broadcasts b JOIN broadcast_jobs j ON j.broadcast_id=b.id
      WHERE b.campaign_id=p_campaign AND j.state IN ('queued','running','paused')) THEN
      RAISE EXCEPTION 'Campaign already has an unfinished execution';
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_recipients) r
    WHERE NOT EXISTS(SELECT 1 FROM contacts c WHERE c.id=(r->>'contact_id')::uuid AND c.account_id=p_account)) THEN
    RAISE EXCEPTION 'Recipient outside account';
  END IF;
  INSERT INTO broadcasts(account_id,user_id,name,template_name,template_language,status,total_recipients,
    audience_filter,template_variables,campaign_id,parent_broadcast_id,request_key)
  VALUES(p_account,p_user,p_name,p_template->>'name',p_template->>'language','sending',
    jsonb_array_length(p_recipients),p_audience,p_variables,p_campaign,p_parent,p_request) RETURNING id INTO bid;
  INSERT INTO broadcast_recipients(broadcast_id,contact_id,status,phone_snapshot,name_snapshot,template_params,dispatch_state)
  SELECT bid,(r->>'contact_id')::uuid,'pending',r->>'phone',r->>'name',r->'params','queued'
    FROM jsonb_array_elements(p_recipients) r;
  INSERT INTO broadcast_jobs(broadcast_id,account_id,phone_number_id,waba_id,template_snapshot,header_media_url)
    VALUES(bid,p_account,p_phone,p_waba,p_template,p_media);
  INSERT INTO broadcast_sender_slots(phone_number_id) VALUES(p_phone) ON CONFLICT DO NOTHING;
  IF p_schedule_lease IS NOT NULL THEN
    UPDATE campaigns SET next_run_at=p_next_run,active=(p_next_run IS NOT NULL),last_error=NULL,
      last_scheduled_at=now(),scheduler_lease=NULL,scheduler_lease_until=NULL,updated_at=now()
      WHERE id=p_campaign AND scheduler_lease=p_schedule_lease AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Schedule lease lost'; END IF;
  END IF;
  RETURN bid;
END $$;

CREATE FUNCTION public.adopt_broadcast_queue(p_id uuid,p_account uuid,p_template jsonb,p_phone text,p_waba text,
  p_media text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM broadcasts WHERE id=p_id AND account_id=p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM broadcast_jobs WHERE broadcast_id=p_id) THEN RETURN true; END IF;
  UPDATE broadcast_recipients r SET phone_snapshot=regexp_replace(c.phone,'[^0-9]','','g'),
    name_snapshot=c.name,dispatch_state='queued'
    FROM contacts c WHERE r.broadcast_id=p_id AND r.contact_id=c.id AND r.status='pending' AND c.account_id=p_account;
  INSERT INTO broadcast_jobs(broadcast_id,account_id,phone_number_id,waba_id,template_snapshot,header_media_url)
    VALUES(p_id,p_account,p_phone,p_waba,p_template,p_media);
  INSERT INTO broadcast_sender_slots(phone_number_id) VALUES(p_phone) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

-- One short DB transaction claims one item. Concurrent workers serialize by sender,
-- not by browser/session. An expired in-flight request is UNKNOWN, never blindly retried.
CREATE FUNCTION public.claim_broadcast_recipient() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE slot broadcast_sender_slots; rec broadcast_recipients; job broadcast_jobs; token uuid;
BEGIN
  UPDATE broadcast_recipients SET dispatch_state='unknown',
    error_message='Resultado incerto: worker interrompido durante o envio. Não reenviado automaticamente.'
    WHERE dispatch_state='sending' AND dispatch_lease_until < now();
  UPDATE broadcast_jobs j SET state='completed',finished_at=now()
    WHERE j.state IN ('queued','running') AND NOT EXISTS
      (SELECT 1 FROM broadcast_recipients r WHERE r.broadcast_id=j.broadcast_id AND r.dispatch_state IN ('queued','sending'));
  UPDATE broadcasts b SET status=CASE WHEN b.failed_count=b.total_recipients THEN 'failed' ELSE 'completed' END
    FROM broadcast_jobs j WHERE j.broadcast_id=b.id AND j.state='completed' AND b.status='sending';
  SELECT s.* INTO slot FROM broadcast_sender_slots s
    WHERE s.lease_until <= now() AND s.next_available_at <= now() AND s.blocked_until <= now()
      AND EXISTS(SELECT 1 FROM broadcast_jobs j JOIN broadcast_recipients r ON r.broadcast_id=j.broadcast_id
        WHERE j.phone_number_id=s.phone_number_id AND j.state IN ('queued','running')
          AND r.dispatch_state='queued' AND r.next_attempt_at<=now())
    ORDER BY s.next_available_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT j.* INTO job FROM broadcast_jobs j WHERE j.phone_number_id=slot.phone_number_id
    AND j.state IN ('queued','running') AND EXISTS(SELECT 1 FROM broadcast_recipients r
      WHERE r.broadcast_id=j.broadcast_id AND r.dispatch_state='queued' AND r.next_attempt_at<=now())
    ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT r.* INTO rec FROM broadcast_recipients r WHERE r.broadcast_id=job.broadcast_id
    AND r.dispatch_state='queued' AND r.next_attempt_at<=now() ORDER BY r.next_attempt_at,r.id
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  token:=gen_random_uuid();
  UPDATE broadcast_recipients SET dispatch_state='sending',attempt_count=attempt_count+1,
    dispatch_lease=token,dispatch_lease_until=now()+interval '90 seconds' WHERE id=rec.id;
  UPDATE broadcast_jobs SET state='running' WHERE broadcast_id=job.broadcast_id;
  UPDATE broadcast_sender_slots SET lease=token,lease_until=now()+interval '90 seconds'
    WHERE phone_number_id=slot.phone_number_id;
  RETURN jsonb_build_object('recipient',to_jsonb(rec),'job',to_jsonb(job),'lease',token);
END $$;

CREATE FUNCTION public.replay_broadcast_status(p_message text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e broadcast_status_events; changed integer:=0; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_message,0));
  FOR e IN SELECT * FROM broadcast_status_events WHERE message_id=p_message
    ORDER BY CASE status WHEN 'sent' THEN 1 WHEN 'failed' THEN 2 WHEN 'delivered' THEN 3 ELSE 4 END LOOP
    UPDATE broadcast_recipients SET status=e.status,
      sent_at=CASE WHEN e.status='sent' THEN COALESCE(sent_at,e.occurred_at) ELSE sent_at END,
      delivered_at=CASE WHEN e.status='delivered' THEN e.occurred_at ELSE delivered_at END,
      read_at=CASE WHEN e.status='read' THEN e.occurred_at ELSE read_at END,
      error_message=CASE WHEN e.status='failed' THEN e.error_message ELSE NULL END
    WHERE whatsapp_message_id=p_message AND
      ((e.status='sent' AND status='pending') OR
       (e.status='failed' AND status IN ('pending','sent')) OR
       (e.status='delivered' AND status IN ('pending','sent')) OR
       (e.status='read' AND status IN ('pending','sent','delivered')));
    GET DIAGNOSTICS n=ROW_COUNT; changed:=changed+n;
  END LOOP;
  RETURN changed;
END $$;
CREATE FUNCTION public.record_broadcast_status(p_message text,p_status text,p_at timestamptz,p_error text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_message,0));
  INSERT INTO broadcast_status_events(message_id,status,occurred_at,error_message)
    VALUES(p_message,p_status,p_at,p_error) ON CONFLICT DO NOTHING;
  RETURN replay_broadcast_status(p_message);
END $$;

CREATE FUNCTION public.finish_broadcast_recipient(p_id uuid,p_lease uuid,p_outcome text,
 p_message text DEFAULT NULL,p_error text DEFAULT NULL,p_delay integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bid uuid; phone text;
BEGIN
  IF p_outcome NOT IN ('accepted','failed','unknown','queued') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF p_message IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_message,0)); END IF;
  IF p_outcome='queued' AND EXISTS(SELECT 1 FROM broadcast_jobs j JOIN broadcast_recipients r ON r.broadcast_id=j.broadcast_id
    WHERE r.id=p_id AND j.state='cancelled') THEN p_outcome:='cancelled'; END IF;
  UPDATE broadcast_recipients SET dispatch_state=p_outcome,
    status=CASE WHEN p_outcome='failed' THEN 'failed' ELSE status END,
    accepted_at=CASE WHEN p_outcome='accepted' THEN now() ELSE accepted_at END,
    whatsapp_message_id=COALESCE(p_message,whatsapp_message_id),error_message=p_error,
    next_attempt_at=now()+make_interval(secs=>p_delay),dispatch_lease_until=NULL
    WHERE id=p_id AND dispatch_lease=p_lease AND dispatch_state IN ('sending','unknown') RETURNING broadcast_id INTO bid;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT phone_number_id INTO phone FROM broadcast_jobs WHERE broadcast_id=bid;
  UPDATE broadcast_sender_slots SET lease_until=now(),
    next_available_at=now()+interval '1 millisecond'*interval_ms,
    blocked_until=CASE WHEN p_outcome='queued' THEN greatest(blocked_until,now()+make_interval(secs=>p_delay)) ELSE blocked_until END
    WHERE phone_number_id=phone AND lease=p_lease;
  IF p_message IS NOT NULL THEN PERFORM replay_broadcast_status(p_message); END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.control_broadcast_job(p_id uuid,p_account uuid,p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM 1 FROM broadcast_jobs WHERE broadcast_id=p_id AND account_id=p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_action='pause' THEN
    UPDATE broadcast_jobs SET state='paused' WHERE broadcast_id=p_id AND state IN ('queued','running');
  ELSIF p_action='resume' THEN
    UPDATE broadcast_jobs SET state='queued' WHERE broadcast_id=p_id AND state='paused';
  ELSIF p_action='cancel' THEN
    UPDATE broadcast_jobs SET state='cancelled',finished_at=now() WHERE broadcast_id=p_id AND state IN ('queued','running','paused');
    UPDATE broadcast_recipients SET dispatch_state='cancelled',error_message='Cancelado antes do envio'
      WHERE broadcast_id=p_id AND dispatch_state='queued';
    UPDATE broadcasts SET status='cancelled' WHERE id=p_id;
  ELSE RAISE EXCEPTION 'Invalid action'; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.claim_due_campaign() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c campaigns; token uuid;
BEGIN
  SELECT * INTO c FROM campaigns WHERE active AND next_run_at<=now()
    AND (scheduler_lease_until IS NULL OR scheduler_lease_until<now())
    AND NOT EXISTS(SELECT 1 FROM broadcasts b JOIN broadcast_jobs j ON j.broadcast_id=b.id
      WHERE b.campaign_id=campaigns.id AND j.state IN ('queued','running','paused'))
    ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  token:=gen_random_uuid();
  UPDATE campaigns SET scheduler_lease=token,scheduler_lease_until=now()+interval '5 minutes' WHERE id=c.id;
  RETURN to_jsonb(c)||jsonb_build_object('scheduler_lease',token);
END $$;

CREATE FUNCTION public.broadcast_queue_progress(p_id uuid,p_account uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('state',j.state,'phone_number_id',j.phone_number_id,'created_at',j.created_at,
    'worker_online',EXISTS(SELECT 1 FROM campaign_worker_heartbeats WHERE seen_at>now()-interval '90 seconds'),
    'total',count(r.id),'processed',count(r.id) FILTER(WHERE r.dispatch_state IN ('accepted','failed','unknown','cancelled')),
    'accepted',count(r.id) FILTER(WHERE r.accepted_at IS NOT NULL),
    'pending',count(r.id) FILTER(WHERE r.dispatch_state IN ('queued','sending')),
    'unknown',count(r.id) FILTER(WHERE r.dispatch_state='unknown'),
    'cancelled',count(r.id) FILTER(WHERE r.dispatch_state='cancelled'),
    'failed',count(r.id) FILTER(WHERE r.status='failed'))
  FROM broadcast_jobs j LEFT JOIN broadcast_recipients r ON r.broadcast_id=j.broadcast_id
  WHERE j.broadcast_id=p_id AND j.account_id=p_account GROUP BY j.broadcast_id;
$$;

-- RPCs are worker/server capabilities. Browser roles only read their own catalog/jobs.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
   AND proname IN ('enqueue_broadcast','adopt_broadcast_queue','claim_broadcast_recipient','finish_broadcast_recipient',
    'record_broadcast_status','replay_broadcast_status','control_broadcast_job','claim_due_campaign','broadcast_queue_progress') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
