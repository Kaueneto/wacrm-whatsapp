-- Queue workers write recipients before rolling up counters on broadcasts.
-- Acquire the migration locks together and retry if a dispatch is active.
LOCK TABLE public.broadcast_recipients, public.broadcasts, public.campaigns
  IN ACCESS EXCLUSIVE MODE NOWAIT;

ALTER TABLE public.campaigns ADD COLUMN department_id uuid;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_department_fk
  FOREIGN KEY (department_id, account_id) REFERENCES public.departments(id, account_id);
ALTER TABLE public.broadcasts ADD COLUMN department_id uuid;
ALTER TABLE public.broadcasts ADD CONSTRAINT broadcasts_department_fk
  FOREIGN KEY (department_id, account_id) REFERENCES public.departments(id, account_id);
CREATE INDEX broadcasts_department_scope ON public.broadcasts(account_id, department_id, created_at)
  WHERE department_id IS NOT NULL;

CREATE FUNCTION public.capture_broadcast_department() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
      RAISE EXCEPTION 'Broadcast department cannot be reassigned' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  NEW.department_id := NULL;
  IF NEW.parent_broadcast_id IS NOT NULL THEN
    SELECT b.department_id INTO NEW.department_id FROM public.broadcasts b
    WHERE b.id = NEW.parent_broadcast_id AND b.account_id = NEW.account_id;
  ELSIF NEW.campaign_id IS NOT NULL THEN
    SELECT c.department_id INTO NEW.department_id FROM public.campaigns c
    WHERE c.id = NEW.campaign_id AND c.account_id = NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_broadcast_department BEFORE INSERT OR UPDATE OF department_id ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.capture_broadcast_department();

CREATE FUNCTION public.validate_department_broadcast_recipient() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_account uuid;
  v_department uuid;
BEGIN
  -- Contact deletion retains historical recipient snapshots.
  IF TG_OP = 'UPDATE' AND NEW.contact_id IS NULL
     AND NEW.broadcast_id IS NOT DISTINCT FROM OLD.broadcast_id THEN
    RETURN NEW;
  END IF;
  SELECT b.account_id, b.department_id INTO v_account, v_department
  FROM public.broadcasts b WHERE b.id = NEW.broadcast_id;
  IF v_department IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.teams t ON t.id = c.team_id AND t.account_id = c.account_id
    WHERE c.contact_id = NEW.contact_id AND c.account_id = v_account
      AND t.department_id = v_department
  ) THEN
    RAISE EXCEPTION 'Recipient outside campaign department' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_department_broadcast_recipient
  BEFORE INSERT OR UPDATE OF broadcast_id, contact_id ON public.broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.validate_department_broadcast_recipient();

CREATE FUNCTION public.can_supervise_department(p_account uuid, p_department uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_account_member(p_account, 'supervisor') AND EXISTS (
    SELECT 1 FROM public.team_members m
    JOIN public.teams t ON t.id = m.team_id AND t.account_id = m.account_id
    WHERE m.account_id = p_account AND m.user_id = auth.uid()
      AND t.department_id = p_department
  );
$$;
REVOKE ALL ON FUNCTION public.can_supervise_department(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_supervise_department(uuid, uuid) TO authenticated;

CREATE FUNCTION public.control_department_broadcast(p_id uuid, p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_account uuid;
BEGIN
  SELECT b.account_id INTO v_account
  FROM public.broadcasts b
  JOIN public.broadcast_jobs j ON j.broadcast_id = b.id AND j.account_id = b.account_id
  WHERE b.id = p_id AND public.can_supervise_department(b.account_id, b.department_id)
    AND ((p_action = 'pause' AND j.state IN ('queued', 'running'))
         OR (p_action = 'resume' AND j.state = 'paused'))
  FOR UPDATE OF j;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN public.control_broadcast_job(p_id, v_account, p_action);
END;
$$;
REVOKE ALL ON FUNCTION public.control_department_broadcast(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_department_broadcast(uuid, text) TO authenticated;
