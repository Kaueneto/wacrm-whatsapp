-- A supervisor covers every team in each department where they have a membership.
CREATE OR REPLACE FUNCTION public.can_supervise_team(target_account uuid, target_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_account_member(target_account, 'admin') OR (
    is_account_member(target_account, 'supervisor') AND EXISTS (
      SELECT 1
      FROM teams target
      JOIN teams affiliated ON affiliated.account_id = target.account_id
        AND affiliated.department_id = target.department_id
      JOIN team_members membership ON membership.team_id = affiliated.id
        AND membership.account_id = affiliated.account_id
      WHERE target.id = target_team AND target.account_id = target_account
        AND membership.user_id = auth.uid()
    ));
$$;

CREATE OR REPLACE FUNCTION public.protect_support_routing() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_teams uuid[];
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id) THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION 'Não é permitido alterar a identidade do atendimento.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    IF NEW.team_id IS NULL AND NEW.assigned_agent_id IS NOT NULL THEN
      SELECT array_agg(team_id) INTO v_teams
      FROM team_members
      WHERE account_id = NEW.account_id AND user_id = NEW.assigned_agent_id;

      IF cardinality(v_teams) = 1 THEN
        NEW.team_id := v_teams[1];
      ELSIF cardinality(v_teams) > 1 AND current_user = 'authenticated' THEN
        RAISE EXCEPTION 'O responsável faz parte de várias equipes. Selecione a equipe de destino.' USING ERRCODE = '23514';
      END IF;
    END IF;

    IF current_user = 'authenticated' AND NOT is_account_member(NEW.account_id, 'admin') THEN
      IF TG_OP = 'INSERT' OR NOT can_supervise_team(OLD.account_id, OLD.team_id) OR NOT can_supervise_team(NEW.account_id, NEW.team_id) THEN
        RAISE EXCEPTION 'Somente um supervisor responsável ou administrador pode distribuir atendimentos.' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NEW.assigned_agent_id IS NOT NULL AND NEW.team_id IS NOT NULL THEN
      IF NOT is_team_assignee(NEW.team_id, NEW.account_id, NEW.assigned_agent_id) THEN RAISE EXCEPTION 'O responsável precisa fazer parte da equipe de destino.' USING ERRCODE = '23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Older assignments selected only an attendant. A single active membership
-- is an unambiguous destination; keep other rows available for manual triage.
WITH inferred_teams AS (
  SELECT account_id, user_id, (array_agg(team_id))[1] AS team_id
  FROM public.team_members
  GROUP BY account_id, user_id
  HAVING count(*) = 1
)
UPDATE public.conversations c
SET team_id = inferred.team_id
FROM inferred_teams inferred
WHERE c.account_id = inferred.account_id AND c.assigned_agent_id = inferred.user_id
  AND c.team_id IS NULL;
