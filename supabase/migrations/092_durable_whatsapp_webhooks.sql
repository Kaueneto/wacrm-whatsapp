CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  event_key text NOT NULL UNIQUE,
  partition_key text NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  payload jsonb,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','done','failed','needs_review')),
  phase text NOT NULL DEFAULT 'ingest' CHECK (phase IN ('ingest','stored','effects_started','duplicate')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  history_only boolean NOT NULL DEFAULT false,
  first_inbound boolean NOT NULL DEFAULT false,
  last_error text
);
CREATE INDEX whatsapp_webhook_ready ON public.whatsapp_webhook_events(available_at,sequence) WHERE state IN ('pending','processing');
CREATE INDEX whatsapp_webhook_partition ON public.whatsapp_webhook_events(partition_key,sequence) WHERE state IN ('pending','processing');
CREATE INDEX whatsapp_webhook_account ON public.whatsapp_webhook_events(account_id,state,received_at);
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_webhook_events FROM anon, authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.whatsapp_webhook_events_sequence_seq TO service_role;
-- Operators see metadata through an authenticated, account-scoped API, not raw payloads.

CREATE TABLE public.whatsapp_webhook_worker_heartbeats (
  id text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_webhook_worker_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_webhook_worker_heartbeats FROM anon, authenticated;
GRANT ALL ON public.whatsapp_webhook_worker_heartbeats TO service_role;

CREATE FUNCTION public.enqueue_whatsapp_webhooks(p_events jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events) > 2000 THEN
    RAISE EXCEPTION 'Invalid webhook batch' USING ERRCODE = '22023';
  END IF;
  INSERT INTO whatsapp_webhook_events(event_key,partition_key,account_id,payload)
    SELECT item->>'key', item->>'partition',
      (SELECT account_id FROM whatsapp_config WHERE
        (phone_number_id = item->>'phone_id') OR
        (NULLIF(item->>'phone_id','') IS NULL AND waba_id = item->>'waba_id') LIMIT 1),
      item->'payload'
    FROM jsonb_array_elements(p_events) WITH ORDINALITY AS batch(item,ordinal)
    ORDER BY ordinal
    ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE FUNCTION public.claim_whatsapp_webhook() RETURNS SETOF public.whatsapp_webhook_events
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH candidate AS (
    SELECT e.id FROM whatsapp_webhook_events e
    WHERE ((e.state = 'pending' AND e.available_at <= now()) OR (e.state = 'processing' AND e.lease_until < now()))
      AND NOT EXISTS (SELECT 1 FROM whatsapp_webhook_events earlier
        WHERE earlier.partition_key = e.partition_key AND earlier.sequence < e.sequence AND earlier.state IN ('pending','processing'))
    ORDER BY e.sequence FOR UPDATE OF e SKIP LOCKED LIMIT 1
  )
  UPDATE whatsapp_webhook_events e SET state = 'processing', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_until = now() + interval '120 seconds'
  FROM candidate WHERE e.id = candidate.id RETURNING e.*;
$$;

CREATE FUNCTION public.begin_whatsapp_webhook_effects(p_id uuid, p_token uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH advanced AS (
    UPDATE whatsapp_webhook_events SET phase = 'effects_started'
    WHERE id = p_id AND lease_token = p_token AND state = 'processing' AND phase IN ('ingest','stored')
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM advanced);
$$;

CREATE FUNCTION public.store_whatsapp_inbound_event(p_id uuid, p_token uuid, p_message jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event whatsapp_webhook_events%ROWTYPE;
  v_conversation conversations%ROWTYPE;
  v_message messages%ROWTYPE;
  v_inserted uuid;
  v_history boolean;
  v_first boolean;
BEGIN
  SELECT * INTO v_event FROM whatsapp_webhook_events WHERE id = p_id AND lease_token = p_token AND state = 'processing' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Webhook lease lost' USING ERRCODE = '40001'; END IF;
  SELECT * INTO v_message FROM jsonb_populate_record(NULL::messages, p_message);
  SELECT * INTO v_conversation FROM conversations WHERE id = v_message.conversation_id AND account_id = v_event.account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation outside event account' USING ERRCODE = '42501'; END IF;
  IF v_message.sender_type <> 'customer' OR v_message.message_id IS NULL OR v_message.created_at IS NULL THEN
    RAISE EXCEPTION 'Invalid inbound message' USING ERRCODE = '22023';
  END IF;
  v_history := v_message.created_at < now() - interval '5 minutes'
    OR coalesce(v_message.created_at < v_conversation.last_inbound_at, false);
  v_first := v_conversation.first_inbound_at IS NULL;
  INSERT INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,media_type,message_id,status,created_at,reply_to_message_id,interactive_reply_id,error_code,error_title,error_details)
    VALUES (coalesce(v_message.id,gen_random_uuid()),v_message.conversation_id,v_message.sender_type,v_message.content_type,v_message.content_text,v_message.media_url,v_message.media_type,v_message.message_id,v_message.status,v_message.created_at,v_message.reply_to_message_id,v_message.interactive_reply_id,v_message.error_code,v_message.error_title,v_message.error_details)
    ON CONFLICT (conversation_id,message_id) DO NOTHING RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN
    IF v_event.phase = 'stored' THEN
      RETURN jsonb_build_object('inserted',false,'resume',true,'history_only',v_event.history_only,'first_inbound',v_event.first_inbound);
    END IF;
    UPDATE whatsapp_webhook_events SET phase = 'duplicate' WHERE id = p_id;
    RETURN jsonb_build_object('inserted',false,'resume',false,'history_only',v_history,'first_inbound',false);
  END IF;
  UPDATE conversations SET unread_count = coalesce(unread_count,0) + 1,
    first_inbound_at = coalesce(first_inbound_at,v_message.created_at),
    last_inbound_at = greatest(last_inbound_at,v_message.created_at),
    last_message_text = CASE WHEN last_message_at IS NULL OR v_message.created_at >= last_message_at THEN coalesce(v_message.content_text,'[' || v_message.content_type || ']') ELSE last_message_text END,
    status = CASE WHEN status = 'closed' AND (last_message_at IS NULL OR v_message.created_at >= last_message_at) THEN CASE WHEN v_history THEN 'pending' ELSE 'open' END ELSE status END,
    last_message_at = greatest(last_message_at,v_message.created_at), updated_at = now()
    WHERE id = v_conversation.id;
  UPDATE whatsapp_webhook_events SET phase = 'stored',history_only = v_history,first_inbound = v_first,conversation_id = v_conversation.id WHERE id = p_id;
  RETURN jsonb_build_object('inserted',true,'resume',false,'history_only',v_history,'first_inbound',v_first);
END;
$$;

CREATE FUNCTION public.cleanup_whatsapp_webhooks() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Chat history is unaffected: only temporary receipt copies are scrubbed.
  UPDATE whatsapp_webhook_events SET payload = NULL WHERE state = 'done' AND finished_at < now() - interval '7 days' AND payload IS NOT NULL;
  DELETE FROM whatsapp_webhook_events WHERE state = 'done' AND finished_at < now() - interval '30 days';
  DELETE FROM whatsapp_webhook_worker_heartbeats WHERE seen_at < now() - interval '7 days';
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_whatsapp_webhooks(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_whatsapp_webhook() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.begin_whatsapp_webhook_effects(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.store_whatsapp_inbound_event(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cleanup_whatsapp_webhooks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_whatsapp_webhooks(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_webhook() TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_whatsapp_webhook_effects(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_whatsapp_inbound_event(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_whatsapp_webhooks() TO service_role;
