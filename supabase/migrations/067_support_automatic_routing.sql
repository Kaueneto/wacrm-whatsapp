-- Called only by server-side automations. Account locking serializes selection
-- so concurrent inbound messages do not all choose the same next attendant.
CREATE FUNCTION public.route_support_conversation(
  p_account_id uuid, p_contact_id uuid, p_team_id uuid, p_agent_id uuid, p_mode text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conversation conversations%ROWTYPE; v_team uuid; v_agent uuid;
BEGIN
  IF p_mode NOT IN ('specific','round_robin','queue') THEN RAISE EXCEPTION 'Invalid routing mode' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM accounts WHERE id = p_account_id FOR UPDATE;
  SELECT * INTO v_conversation FROM conversations WHERE account_id = p_account_id AND contact_id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_team := COALESCE(p_team_id, v_conversation.team_id);
  IF v_team IS NOT NULL AND NOT EXISTS (SELECT 1 FROM teams WHERE id = v_team AND account_id = p_account_id) THEN
    RAISE EXCEPTION 'Team is outside the account' USING ERRCODE = '23514';
  END IF;
  IF p_mode = 'specific' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = p_agent_id AND account_id = p_account_id AND account_role IN ('owner','admin','supervisor','agent'))
      OR (v_team IS NOT NULL AND NOT is_team_assignee(v_team, p_account_id, p_agent_id)) THEN
      RAISE EXCEPTION 'Assignee is not an eligible team member' USING ERRCODE = '23514';
    END IF;
    v_agent := p_agent_id;
  ELSIF p_mode = 'round_robin' THEN
    SELECT p.user_id INTO v_agent FROM profiles p
      JOIN member_presence presence ON presence.user_id = p.user_id AND presence.account_id = p.account_id
      WHERE p.account_id = p_account_id AND p.account_role = 'agent'
        AND presence.status = 'online' AND presence.last_seen_at > now() - interval '90 seconds'
        AND (v_team IS NULL OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = v_team AND tm.user_id = p.user_id AND tm.account_id = p_account_id))
      ORDER BY (SELECT max(e.created_at) FROM conversation_assignment_events e JOIN conversations c ON c.id = e.conversation_id WHERE e.agent_id = p.user_id AND c.account_id = p_account_id) ASC NULLS FIRST, p.user_id
      LIMIT 1;
  END IF;
  -- No online attendant (or explicit queue): keep the selected team's queue.
  UPDATE conversations SET team_id = v_team, assigned_agent_id = v_agent WHERE id = v_conversation.id;
  RETURN v_agent;
END;
$$;
REVOKE ALL ON FUNCTION public.route_support_conversation(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_support_conversation(uuid, uuid, uuid, uuid, text) TO service_role;

-- Existing definer RPCs must honor administrative scope as well as RLS.
DO $$ DECLARE definition text; BEGIN
  IF to_regprocedure('public.replace_flow_nodes(uuid,jsonb)') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.replace_flow_nodes(uuid,jsonb)'::regprocedure) INTO definition;
    EXECUTE replace(definition, 'is_account_member(v_account_id, ''agent'')', 'is_account_member(v_account_id, ''admin'')');
  END IF;
  IF to_regprocedure('public.match_ai_knowledge_fts(uuid,text,integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.match_ai_knowledge_fts(uuid,text,integer) FROM authenticated;
  END IF;
END $$;
