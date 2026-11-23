CREATE OR REPLACE FUNCTION public.handoff_conversation_from_ai(
  p_account_id uuid, p_conversation_id uuid, p_agent_id uuid, p_summary text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_context text := COALESCE(current_setting('app.ai_assignment_conversation_id', true), '');
BEGIN
  PERFORM set_config('app.ai_assignment_conversation_id', p_conversation_id::text, true);
  -- Pause the bot and retain the summary even if the configured agent
  -- cannot take conversations from this team.
  UPDATE conversations
  SET ai_autoreply_disabled = true,
      ai_handoff_summary = p_summary,
      assigned_agent_id = COALESCE(assigned_agent_id, CASE
        WHEN p_agent_id IS NOT NULL
          AND (team_id IS NULL OR is_team_assignee(team_id, account_id, p_agent_id))
        THEN p_agent_id
      END)
  WHERE id = p_conversation_id AND account_id = p_account_id;
  PERFORM set_config('app.ai_assignment_conversation_id', v_previous_context, true);
END;
$$;
