-- Save the profile and all team memberships together. Existing removal triggers
-- return conversations from removed teams to their queues.
CREATE FUNCTION public.edit_account_member(
  p_user_id uuid, p_name text, p_role public.account_role_enum, p_team_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account uuid;
  v_role account_role_enum;
BEGIN
  PERFORM 1 FROM profiles WHERE user_id IN (auth.uid(), p_user_id) ORDER BY user_id FOR UPDATE;
  SELECT account_id INTO v_account FROM profiles WHERE user_id = auth.uid();
  IF v_account IS NULL OR NOT is_account_member(v_account, 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem editar usuários.' USING ERRCODE = '42501';
  END IF;
  SELECT account_role INTO v_role FROM profiles
    WHERE user_id = p_user_id AND account_id = v_account FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário fora da empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 120 OR p_role IS NULL OR p_team_ids IS NULL THEN
    RAISE EXCEPTION 'Informe nome, perfil e equipes válidos.' USING ERRCODE = '22023';
  END IF;
  IF p_role IS DISTINCT FROM v_role AND (p_user_id = auth.uid() OR v_role = 'owner' OR p_role = 'owner') THEN
    RAISE EXCEPTION 'Não é permitido alterar o próprio perfil ou a titularidade da empresa.' USING ERRCODE = '22023';
  END IF;
  IF p_role = 'viewer' AND cardinality(p_team_ids) > 0 THEN
    RAISE EXCEPTION 'Este perfil não pode integrar equipes de atendimento.' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM teams WHERE account_id = v_account AND id = ANY(p_team_ids) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM unnest(p_team_ids) AS selected(id)
    WHERE selected.id IS NULL OR NOT EXISTS (
      SELECT 1 FROM teams WHERE teams.id = selected.id AND account_id = v_account
    )) THEN
    RAISE EXCEPTION 'Selecione equipes pertencentes à empresa.' USING ERRCODE = '22023';
  END IF;
  UPDATE profiles SET full_name = trim(p_name), account_role = p_role WHERE user_id = p_user_id;
  INSERT INTO team_members(account_id, team_id, user_id)
    SELECT DISTINCT v_account, selected.id, p_user_id FROM unnest(p_team_ids) AS selected(id)
    ON CONFLICT (team_id, user_id) DO NOTHING;
  DELETE FROM team_members WHERE account_id = v_account AND user_id = p_user_id
    AND NOT (team_id = ANY(p_team_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.edit_account_member(uuid, text, public.account_role_enum, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_account_member(uuid, text, public.account_role_enum, uuid[]) TO authenticated;
