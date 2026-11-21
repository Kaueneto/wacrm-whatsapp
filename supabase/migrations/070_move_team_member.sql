-- Move the membership in one transaction. Removing the source membership uses
-- the existing trigger to return that team's conversations to its queue.
CREATE FUNCTION public.move_support_team_member(p_user_id uuid, p_source_team_id uuid, p_target_team_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_account uuid;
BEGIN
  SELECT account_id INTO v_account FROM profiles WHERE user_id = auth.uid();
  IF v_account IS NULL OR NOT is_account_member(v_account, 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem mover integrantes.' USING ERRCODE = '42501';
  END IF;
  IF p_source_team_id IS NULL OR p_target_team_id IS NULL OR p_source_team_id = p_target_team_id THEN
    RAISE EXCEPTION 'Selecione equipes de origem e destino diferentes.' USING ERRCODE = '22023';
  END IF;
  -- Same lock order as membership changes: profile, then team membership rows.
  PERFORM 1 FROM profiles WHERE user_id = p_user_id AND account_id = v_account FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário fora da empresa.' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM teams WHERE account_id = v_account AND id IN (p_source_team_id, p_target_team_id) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM teams WHERE account_id = v_account AND id = p_target_team_id) THEN
    RAISE EXCEPTION 'Equipe de destino fora da empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM team_members WHERE account_id = v_account AND team_id = p_source_team_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'O usuário não pertence mais à equipe de origem.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO team_members(account_id, team_id, user_id) VALUES (v_account, p_target_team_id, p_user_id)
    ON CONFLICT (team_id, user_id) DO NOTHING;
  DELETE FROM team_members WHERE account_id = v_account AND team_id = p_source_team_id AND user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.move_support_team_member(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_support_team_member(uuid, uuid, uuid) TO authenticated;
