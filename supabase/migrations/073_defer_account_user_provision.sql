CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_full_name text := coalesce(NEW.raw_user_meta_data->>'full_name', '');
  v_provision jsonb;
  v_account_id uuid;
  v_role public.account_role_enum;
  v_team_id uuid;
BEGIN
  -- Auth adds administrator metadata after INSERT. Read the final row
  -- at commit, since NEW contains only the original insert.
  SELECT raw_app_meta_data->'crm_provision' INTO v_provision
  FROM auth.users WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Only Auth administrators can supply app metadata. Never take tenant or
  -- role from user metadata, which is writable by self-service signups.
  IF v_provision IS NOT NULL THEN
    v_account_id := (v_provision->>'account_id')::uuid;
    v_role := (v_provision->>'role')::public.account_role_enum;
    v_team_id := (v_provision->>'team_id')::uuid;
    PERFORM 1 FROM public.profiles
    WHERE user_id = (v_provision->>'creator_id')::uuid
      AND account_id = v_account_id AND account_role IN ('owner', 'admin')
    FOR SHARE;
    IF NOT FOUND OR v_role IS NULL OR v_role NOT IN ('admin', 'supervisor', 'agent') THEN
      RAISE EXCEPTION 'Invalid company user provisioning request' USING ERRCODE = '42501';
    END IF;
    IF v_team_id IS NOT NULL THEN
      PERFORM 1 FROM public.teams
      WHERE id = v_team_id AND account_id = v_account_id
        AND department_id = (v_provision->>'department_id')::uuid
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Team does not belong to the selected department' USING ERRCODE = '23514';
      END IF;
    END IF;

    INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
    VALUES (NEW.id, v_full_name, NEW.email, v_account_id, v_role);
    IF v_team_id IS NOT NULL THEN
      INSERT INTO public.team_members (account_id, team_id, user_id)
      VALUES (v_account_id, v_team_id, NEW.id);
    END IF;
    UPDATE public.pending_account_users
    SET activated_at = now(), activated_user_id = NEW.id
    WHERE account_id = v_account_id AND activated_at IS NULL
      AND lower(btrim(email)) = lower(btrim(NEW.email));
    RETURN NEW;
  END IF;

  -- Keep the existing standalone signup behavior and error handling.
  BEGIN
    INSERT INTO public.accounts (name, owner_user_id)
    VALUES (coalesce(nullif(v_full_name, ''), NEW.email, 'My account'), NEW.id)
    RETURNING id INTO v_account_id;
    INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
    VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE CONSTRAINT TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
