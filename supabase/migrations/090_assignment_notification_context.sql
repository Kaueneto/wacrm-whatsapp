ALTER TABLE public.notifications
  ADD COLUMN assignment_origin text CHECK (assignment_origin IN ('ai', 'manual')),
  ADD COLUMN contact_name text,
  ADD COLUMN actor_name text;

CREATE OR REPLACE FUNCTION public.notify_conversation_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_name text;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_origin text;
BEGIN
  IF NEW.assigned_agent_id IS NULL OR v_actor_id = NEW.assigned_agent_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_agent_id IS NOT DISTINCT FROM OLD.assigned_agent_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = NEW.assigned_agent_id
      AND account_id = NEW.account_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(name), ''), NULLIF(btrim(phone), ''))
  INTO v_contact_name
  FROM contacts
  WHERE id = NEW.contact_id AND account_id = NEW.account_id;

  IF v_actor_id IS NOT NULL THEN
    v_origin := 'manual';
    SELECT NULLIF(btrim(full_name), '') INTO v_actor_name
    FROM profiles WHERE user_id = v_actor_id AND account_id = NEW.account_id;
  ELSIF current_setting('app.ai_assignment_conversation_id', true) = NEW.id::text THEN
    v_origin := 'ai';
  END IF;

  INSERT INTO notifications (
    account_id, user_id, type, conversation_id, contact_id,
    actor_user_id, assignment_origin, contact_name, actor_name, title, body
  ) VALUES (
    NEW.account_id, NEW.assigned_agent_id, 'conversation_assigned',
    NEW.id, NEW.contact_id, v_actor_id, v_origin, v_contact_name, v_actor_name,
    CASE WHEN v_origin = 'ai' THEN 'Conversation transferred by AI'
      ELSE 'New conversation assigned' END,
    CASE WHEN v_origin = 'ai' THEN 'AI transferred the conversation with '
      || COALESCE(v_contact_name, 'a contact') || ' to you.'
      ELSE COALESCE(v_actor_name, 'Someone') || ' assigned you a conversation with '
        || COALESCE(v_contact_name, 'a contact') END
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create assignment notification for conversation %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_flow_ai(p_account_id uuid, p_conversation_id uuid, p_summary text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation conversations%ROWTYPE;
  v_mode text;
  v_previous_context text := COALESCE(current_setting('app.ai_assignment_conversation_id', true), '');
BEGIN
  -- Same lock order as route_support_conversation; this also serializes handoffs.
  PERFORM 1 FROM accounts WHERE id = p_account_id FOR UPDATE;
  SELECT * INTO v_conversation FROM conversations WHERE id = p_conversation_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND OR v_conversation.ai_flow_context IS NULL OR v_conversation.assigned_agent_id IS NOT NULL
    OR v_conversation.ai_autoreply_disabled THEN RETURN false; END IF;
  v_mode := v_conversation.ai_flow_context->>'handoff_mode';
  IF v_mode NOT IN ('queue','round_robin') OR v_mode IS NULL THEN v_mode := 'queue'; END IF;
  PERFORM set_config('app.ai_assignment_conversation_id', p_conversation_id::text, true);
  PERFORM route_support_conversation(p_account_id, v_conversation.contact_id, v_conversation.team_id, NULL, v_mode);
  PERFORM set_config('app.ai_assignment_conversation_id', v_previous_context, true);
  UPDATE conversations SET ai_flow_context = NULL, ai_autoreply_disabled = true,
    ai_handoff_summary = p_summary, status = 'pending' WHERE id = p_conversation_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.handoff_conversation_from_ai(
  p_account_id uuid, p_conversation_id uuid, p_agent_id uuid, p_summary text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_context text := COALESCE(current_setting('app.ai_assignment_conversation_id', true), '');
BEGIN
  PERFORM set_config('app.ai_assignment_conversation_id', p_conversation_id::text, true);
  UPDATE conversations
  SET ai_autoreply_disabled = true,
      ai_handoff_summary = p_summary,
      assigned_agent_id = COALESCE(assigned_agent_id, p_agent_id)
  WHERE id = p_conversation_id AND account_id = p_account_id;
  PERFORM set_config('app.ai_assignment_conversation_id', v_previous_context, true);
END;
$$;

REVOKE ALL ON FUNCTION public.handoff_conversation_from_ai(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_conversation_from_ai(uuid, uuid, uuid, text) TO service_role;
