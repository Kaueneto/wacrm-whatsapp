-- Re-evaluate lateness after a stored receipt waits for recovery.
-- Preserve newer human replies; Meta timestamps have one-second precision.
CREATE OR REPLACE FUNCTION public.store_whatsapp_inbound_event(p_id uuid, p_token uuid, p_message jsonb) RETURNS jsonb
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
    OR coalesce(v_message.created_at < v_conversation.last_inbound_at, false)
    OR coalesce(v_message.created_at < v_conversation.last_message_at - interval '1 second', false);
  v_first := v_conversation.first_inbound_at IS NULL;
  INSERT INTO messages(id,conversation_id,sender_type,content_type,content_text,media_url,media_type,message_id,status,created_at,reply_to_message_id,interactive_reply_id,error_code,error_title,error_details)
    VALUES (coalesce(v_message.id,gen_random_uuid()),v_message.conversation_id,v_message.sender_type,v_message.content_type,v_message.content_text,v_message.media_url,v_message.media_type,v_message.message_id,v_message.status,v_message.created_at,v_message.reply_to_message_id,v_message.interactive_reply_id,v_message.error_code,v_message.error_title,v_message.error_details)
    ON CONFLICT (conversation_id,message_id) DO NOTHING RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN
    IF v_event.phase = 'stored' THEN
      UPDATE whatsapp_webhook_events SET history_only = v_event.history_only OR v_history WHERE id = p_id;
      RETURN jsonb_build_object('inserted',false,'resume',true,'history_only',v_event.history_only OR v_history,'first_inbound',v_event.first_inbound);
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
