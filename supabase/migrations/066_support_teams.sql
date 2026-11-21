-- Support scope: administrator > supervisor > assigned attendant.
-- 065 must be committed before applying this migration.
CREATE OR REPLACE FUNCTION public.is_account_member(target_account_id uuid, min_role account_role_enum DEFAULT 'viewer')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid()
    AND p.account_id = target_account_id
    AND CASE p.account_role WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'supervisor' THEN 2.5 WHEN 'agent' THEN 2 WHEN 'viewer' THEN 1 END
     >= CASE min_role WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'supervisor' THEN 2.5 WHEN 'agent' THEN 2 WHEN 'viewer' THEN 1 END);
$$;

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, account_id), UNIQUE (account_id, name)
);
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (department_id, account_id) REFERENCES public.departments(id, account_id),
  UNIQUE (id, account_id), UNIQUE (department_id, name)
);
CREATE TABLE public.team_members (
  team_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id, account_id) REFERENCES public.teams(id, account_id) ON DELETE CASCADE
);
CREATE INDEX team_members_by_user ON public.team_members(user_id, account_id);
ALTER TABLE public.conversations ADD COLUMN team_id uuid;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_team_account_fk
  FOREIGN KEY (team_id, account_id) REFERENCES public.teams(id, account_id);
CREATE INDEX conversations_team_scope ON public.conversations(account_id, team_id);
CREATE INDEX conversations_agent_scope ON public.conversations(account_id, assigned_agent_id);

CREATE FUNCTION public.can_supervise_team(target_account uuid, target_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_account_member(target_account, 'admin') OR (
    is_account_member(target_account, 'supervisor') AND EXISTS (
      SELECT 1 FROM team_members WHERE account_id = target_account AND team_id = target_team AND user_id = auth.uid()
    ));
$$;
CREATE FUNCTION public.can_access_conversation(target_account uuid, target_team uuid, target_agent uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT can_supervise_team(target_account, target_team) OR (
    is_account_member(target_account, 'agent') AND target_agent = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.can_supervise_team(uuid, uuid), public.can_access_conversation(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_supervise_team(uuid, uuid), public.can_access_conversation(uuid, uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments, public.teams, public.team_members TO authenticated;
GRANT ALL ON public.departments, public.teams, public.team_members TO service_role;
CREATE POLICY departments_read ON public.departments FOR SELECT TO authenticated USING (is_account_member(account_id));
CREATE POLICY departments_admin ON public.departments FOR ALL TO authenticated USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY teams_read ON public.teams FOR SELECT TO authenticated USING (can_supervise_team(account_id, id) OR EXISTS (
  SELECT 1 FROM team_members tm WHERE tm.team_id = teams.id AND tm.user_id = auth.uid()
));
CREATE POLICY teams_admin ON public.teams FOR ALL TO authenticated USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY team_members_read ON public.team_members FOR SELECT TO authenticated USING (can_supervise_team(account_id, team_id) OR user_id = auth.uid());
CREATE POLICY team_members_admin ON public.team_members FOR ALL TO authenticated USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));

CREATE FUNCTION public.validate_team_member() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE user_id = NEW.user_id AND account_id = NEW.account_id
    AND account_role IN ('owner','admin','supervisor','agent') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O usuário precisa pertencer à empresa e ter perfil de atendimento.' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_team_member BEFORE INSERT OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.validate_team_member();

CREATE FUNCTION public.cleanup_support_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.account_role = 'viewer' THEN
    DELETE FROM team_members WHERE user_id = OLD.user_id;
    UPDATE conversations SET assigned_agent_id = NULL WHERE account_id = OLD.account_id AND assigned_agent_id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cleanup_support_membership BEFORE UPDATE OF account_id, account_role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.cleanup_support_membership();

-- Restrictive policies combine with existing permissive policies, rather than
-- accidentally retaining the old account-wide access through an OR clause.
CREATE POLICY support_conversation_scope ON public.conversations AS RESTRICTIVE FOR ALL TO authenticated
  USING (can_access_conversation(account_id, team_id, assigned_agent_id))
  WITH CHECK (can_access_conversation(account_id, team_id, assigned_agent_id));
CREATE POLICY support_contact_scope ON public.contacts AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_account_member(account_id, 'admin') OR EXISTS (SELECT 1 FROM conversations c WHERE c.contact_id = contacts.id))
  WITH CHECK (is_account_member(account_id, 'admin') OR EXISTS (SELECT 1 FROM conversations c WHERE c.contact_id = contacts.id));
CREATE POLICY support_message_scope ON public.messages AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id));
CREATE POLICY support_note_scope ON public.contact_notes AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_notes.contact_id))
  WITH CHECK (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_notes.contact_id));

-- Attendants cannot change routing or identifiers using a direct browser write.
CREATE FUNCTION public.is_team_assignee(target_team uuid, target_account uuid, target_user uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_account_member(target_account) AND current_setting('role', true) = 'authenticated' THEN RETURN false; END IF;
  PERFORM 1 FROM team_members tm JOIN profiles p ON p.user_id = tm.user_id AND p.account_id = tm.account_id
    WHERE tm.team_id = target_team AND tm.account_id = target_account AND tm.user_id = target_user
      AND p.account_role IN ('owner','admin','supervisor','agent') FOR SHARE OF tm, p;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.is_team_assignee(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_assignee(uuid, uuid, uuid) TO authenticated, service_role;
CREATE FUNCTION public.protect_support_routing() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id) THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION 'Não é permitido alterar a identidade do atendimento.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
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
CREATE TRIGGER protect_support_routing BEFORE INSERT OR UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.protect_support_routing();
CREATE POLICY support_conversation_delete ON public.conversations AS RESTRICTIVE FOR DELETE TO authenticated USING (is_account_member(account_id, 'admin'));
CREATE POLICY support_contact_delete ON public.contacts AS RESTRICTIVE FOR DELETE TO authenticated USING (is_account_member(account_id, 'admin'));

CREATE TABLE public.conversation_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_user_id uuid,
  old_team_id uuid, team_id uuid,
  old_agent_id uuid, agent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignment_events_by_agent ON public.conversation_assignment_events(agent_id, created_at DESC);
ALTER TABLE public.conversation_assignment_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.conversation_assignment_events TO authenticated;
GRANT ALL ON public.conversation_assignment_events TO service_role;
CREATE POLICY assignment_events_read ON public.conversation_assignment_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND can_supervise_team(c.account_id, c.team_id)));
CREATE FUNCTION public.audit_support_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
    INSERT INTO conversation_assignment_events(conversation_id, actor_user_id, old_team_id, team_id, old_agent_id, agent_id)
      VALUES (NEW.id, auth.uid(), OLD.team_id, NEW.team_id, OLD.assigned_agent_id, NEW.assigned_agent_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_support_assignment AFTER UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.audit_support_assignment();

-- Remove a member from a team only after returning their conversations to its
-- queue. Demotion/removal from the company is handled by the profile trigger.
CREATE FUNCTION public.release_team_assignments() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
  UPDATE conversations SET assigned_agent_id = NULL WHERE team_id = OLD.team_id AND assigned_agent_id = OLD.user_id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER release_team_assignments AFTER DELETE OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.release_team_assignments();

-- Account-wide operational modules are administrative in this first version.
DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['campaigns','broadcasts','automations','automation_logs','flows','flow_runs','deals','pipelines','ai_configs','ai_usage_log','ai_knowledge_documents','ai_knowledge_chunks','api_keys','webhook_endpoints'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = relation AND column_name = 'account_id') THEN
      EXECUTE format('CREATE POLICY support_admin_scope ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (is_account_member(account_id, ''admin'')) WITH CHECK (is_account_member(account_id, ''admin''))', relation);
    END IF;
  END LOOP;
END $$;

-- Trigger functions are not browser-callable RPCs.
REVOKE ALL ON FUNCTION public.validate_team_member(), public.cleanup_support_membership(), public.protect_support_routing(), public.audit_support_assignment(), public.release_team_assignments() FROM PUBLIC, anon, authenticated;
