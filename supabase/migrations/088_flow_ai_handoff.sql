ALTER TABLE public.flow_nodes DROP CONSTRAINT flow_nodes_node_type_check;
ALTER TABLE public.flow_nodes ADD CONSTRAINT flow_nodes_node_type_check CHECK (node_type IN (
  'start','send_message','send_buttons','send_list','send_media','collect_input','condition','set_tag','handoff','http_fetch','ai_assistant','end'
));
ALTER TABLE public.conversations ADD COLUMN ai_flow_context jsonb;

CREATE FUNCTION public.start_flow_ai(p_account_id uuid, p_conversation_id uuid, p_team_id uuid, p_context jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conversation conversations%ROWTYPE;
BEGIN
  PERFORM 1 FROM accounts WHERE id = p_account_id FOR UPDATE;
  SELECT * INTO v_conversation FROM conversations WHERE id = p_conversation_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento fora da empresa.' USING ERRCODE = '42501'; END IF;
  IF v_conversation.assigned_agent_id IS NOT NULL THEN
    RAISE EXCEPTION 'O atendimento já possui um responsável humano.' USING ERRCODE = '22023';
  END IF;
  IF p_team_id IS NULL OR NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND account_id = p_account_id) THEN
    RAISE EXCEPTION 'Selecione uma equipe da empresa.' USING ERRCODE = '22023';
  END IF;
  IF p_context IS NULL OR jsonb_typeof(p_context) <> 'object' OR p_context->>'kind' IS DISTINCT FROM 'flow'
    OR coalesce(p_context->>'handoff_mode','') NOT IN ('queue','round_robin') THEN
    RAISE EXCEPTION 'Configuração da IA inválida.' USING ERRCODE = '22023';
  END IF;
  UPDATE conversations SET team_id = p_team_id, ai_flow_context = p_context,
    ai_autoreply_disabled = false, ai_reply_count = 0, ai_handoff_summary = NULLIF(p_context->>'note',''), status = 'open'
    WHERE id = p_conversation_id;
  -- Explicit routing can use the assistant without enabling account-wide auto-replies.
  RETURN EXISTS (SELECT 1 FROM ai_configs WHERE account_id = p_account_id AND is_active AND api_key IS NOT NULL);
END;
$$;

CREATE FUNCTION public.finish_flow_ai(p_account_id uuid, p_conversation_id uuid, p_summary text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_conversation conversations%ROWTYPE; v_mode text;
BEGIN
  -- Same lock order as route_support_conversation; this also serializes handoffs.
  PERFORM 1 FROM accounts WHERE id = p_account_id FOR UPDATE;
  SELECT * INTO v_conversation FROM conversations WHERE id = p_conversation_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND OR v_conversation.ai_flow_context IS NULL OR v_conversation.assigned_agent_id IS NOT NULL
    OR v_conversation.ai_autoreply_disabled THEN RETURN false; END IF;
  v_mode := v_conversation.ai_flow_context->>'handoff_mode';
  IF v_mode NOT IN ('queue','round_robin') OR v_mode IS NULL THEN v_mode := 'queue'; END IF;
  PERFORM route_support_conversation(p_account_id, v_conversation.contact_id, v_conversation.team_id, NULL, v_mode);
  UPDATE conversations SET ai_flow_context = NULL, ai_autoreply_disabled = true,
    ai_handoff_summary = p_summary, status = 'pending' WHERE id = p_conversation_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.start_flow_ai(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_flow_ai(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_flow_ai(uuid, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_flow_ai(uuid, uuid, text) TO service_role;

CREATE FUNCTION public.protect_flow_ai_context() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' AND NEW.ai_flow_context IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.ai_flow_context IS DISTINCT FROM OLD.ai_flow_context) THEN
    RAISE EXCEPTION 'Apenas o fluxo pode iniciar uma sessão de IA.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_flow_ai_context BEFORE INSERT OR UPDATE OF ai_flow_context ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.protect_flow_ai_context();
