-- Flow authors can choose a supervised queue or a queue the destination team can claim.
-- Existing conversations retain the supervised behavior.
ALTER TABLE public.conversations ADD COLUMN team_queue_enabled boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.can_access_team_queue(target_account uuid, target_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_account_member(target_account, 'agent') AND EXISTS (
    SELECT 1 FROM team_members
    WHERE account_id = target_account AND team_id = target_team AND user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_team_queue(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_team_queue(uuid, uuid) TO authenticated, service_role;

ALTER POLICY support_conversation_scope ON public.conversations
  USING (can_access_conversation(account_id, team_id, assigned_agent_id) OR (
    team_queue_enabled AND assigned_agent_id IS NULL AND status <> 'closed'
    AND can_access_team_queue(account_id, team_id)
  ))
  WITH CHECK (can_access_conversation(account_id, team_id, assigned_agent_id) OR (
    team_queue_enabled AND assigned_agent_id IS NULL AND status <> 'closed'
    AND can_access_team_queue(account_id, team_id)
  ));

CREATE FUNCTION public.protect_team_queue() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.team_queue_enabled AND NOT can_supervise_team(OLD.account_id, OLD.team_id) THEN
        RAISE EXCEPTION 'Somente a supervisão pode remover atendimentos da fila.' USING ERRCODE = '42501';
      END IF;
      RETURN OLD;
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.team_queue_enabled) OR
       (TG_OP = 'UPDATE' AND NEW.team_queue_enabled IS DISTINCT FROM OLD.team_queue_enabled) THEN
      IF NOT is_account_member(NEW.account_id, 'admin') THEN
        RAISE EXCEPTION 'Somente um administrador pode configurar a fila da equipe.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_team_queue BEFORE INSERT OR UPDATE OR DELETE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.protect_team_queue();

-- Viewing a shared queue does not grant permission to send before taking responsibility.
CREATE FUNCTION public.can_write_queue_message(target_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = target_conversation AND (
      NOT c.team_queue_enabled OR c.assigned_agent_id = auth.uid()
      OR can_supervise_team(c.account_id, c.team_id)
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_write_queue_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_queue_message(uuid) TO authenticated, service_role;
CREATE POLICY team_queue_message_insert ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (can_write_queue_message(conversation_id));
CREATE POLICY team_queue_message_update ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (can_write_queue_message(conversation_id)) WITH CHECK (can_write_queue_message(conversation_id));
CREATE POLICY team_queue_message_delete ON public.messages AS RESTRICTIVE FOR DELETE TO authenticated
  USING (can_write_queue_message(conversation_id));

CREATE OR REPLACE FUNCTION public.route_support_conversation(
  p_account_id uuid, p_contact_id uuid, p_team_id uuid, p_agent_id uuid, p_mode text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conversation conversations%ROWTYPE; v_team uuid; v_agent uuid;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('specific','round_robin','queue','team_queue') THEN
    RAISE EXCEPTION 'Invalid routing mode' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM accounts WHERE id = p_account_id FOR UPDATE;
  SELECT * INTO v_conversation FROM conversations
    WHERE account_id = p_account_id AND contact_id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_team := COALESCE(p_team_id, v_conversation.team_id);
  IF (p_mode = 'team_queue' AND v_team IS NULL) OR
     (v_team IS NOT NULL AND NOT EXISTS (SELECT 1 FROM teams WHERE id = v_team AND account_id = p_account_id)) THEN
    RAISE EXCEPTION 'A valid destination team is required' USING ERRCODE = '23514';
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
  UPDATE conversations SET team_id = v_team, assigned_agent_id = v_agent,
    team_queue_enabled = (p_mode = 'team_queue') WHERE id = v_conversation.id;
  RETURN v_agent;
END;
$$;

-- The row lock ensures two attendants cannot both claim the same conversation.
CREATE FUNCTION public.claim_team_conversation(p_conversation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conversation conversations%ROWTYPE; v_user uuid := auth.uid();
BEGIN
  SELECT * INTO v_conversation FROM conversations WHERE id = p_conversation_id FOR UPDATE;
  IF NOT FOUND OR NOT v_conversation.team_queue_enabled OR NOT EXISTS (
    SELECT 1 FROM profiles p JOIN team_members tm ON tm.user_id = p.user_id AND tm.account_id = p.account_id
    WHERE p.user_id = v_user AND p.account_id = v_conversation.account_id AND p.account_role = 'agent'
      AND tm.team_id = v_conversation.team_id
  ) THEN
    RAISE EXCEPTION 'Atendimento não disponível na sua fila.' USING ERRCODE = '42501';
  END IF;
  IF v_conversation.assigned_agent_id IS NOT NULL OR v_conversation.status = 'closed' THEN
    RAISE EXCEPTION 'Este atendimento já foi assumido ou encerrado.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE conversations SET assigned_agent_id = v_user, status = 'open', ai_autoreply_disabled = true
    WHERE id = p_conversation_id;
  RETURN v_user;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_team_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_team_conversation(uuid) TO authenticated;
