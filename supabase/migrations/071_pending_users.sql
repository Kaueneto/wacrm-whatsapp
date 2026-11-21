-- A pre-created company user is separate from an authenticated account until
-- the recipient proves control of the email address and activates their access.
CREATE TABLE public.pending_account_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 254),
  role public.account_role_enum NOT NULL CHECK (role IN ('admin', 'supervisor', 'agent')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_at timestamptz,
  activated_at timestamptz,
  activated_user_id uuid REFERENCES auth.users(id),
  UNIQUE (id, account_id)
);
CREATE UNIQUE INDEX pending_account_users_email_unique
  ON public.pending_account_users(account_id, lower(btrim(email)))
  WHERE activated_at IS NULL;
ALTER TABLE public.pending_account_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_account_users FROM anon, authenticated;
GRANT SELECT ON public.pending_account_users TO authenticated;
GRANT INSERT (account_id, full_name, email, role, created_by) ON public.pending_account_users TO authenticated;
GRANT ALL ON public.pending_account_users TO service_role;
CREATE POLICY pending_users_read ON public.pending_account_users FOR SELECT TO authenticated
  USING (public.is_account_member(account_id, 'admin'));
CREATE POLICY pending_users_create ON public.pending_account_users FOR INSERT TO authenticated
  WITH CHECK (public.is_account_member(account_id, 'admin') AND created_by = auth.uid());

CREATE FUNCTION public.check_pending_user_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE account_id = NEW.account_id AND lower(btrim(email)) = lower(btrim(NEW.email))
  ) THEN
    RAISE EXCEPTION 'Email already belongs to an account member' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_pending_user_email BEFORE INSERT ON public.pending_account_users
  FOR EACH ROW EXECUTE FUNCTION public.check_pending_user_email();

-- Preserve pending user records when redeeming a legacy invitation.
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_old_account_id UUID;
  v_old_account_owner UUID;
  v_has_other_members BOOLEAN;
  v_has_data BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been redeemed'
      USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  SELECT p.account_id, a.owner_user_id
  INTO v_old_account_id, v_old_account_owner
  FROM profiles p
  JOIN accounts a ON a.id = p.account_id
  WHERE p.user_id = v_caller_id
  FOR UPDATE OF p, a;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION 'Caller has no profile' USING ERRCODE = '42501';
  END IF;

  IF v_old_account_id = v_inv.account_id THEN
    RAISE EXCEPTION 'You are already a member of this account'
      USING ERRCODE = '23505';
  END IF;

  IF v_old_account_owner <> v_caller_id THEN
    RAISE EXCEPTION 'You are already in a shared account; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE account_id = v_old_account_id
      AND user_id <> v_caller_id
  ) INTO v_has_other_members;

  IF v_has_other_members THEN
    RAISE EXCEPTION 'Your account has other members; remove them or transfer ownership before joining another account'
      USING ERRCODE = '23505';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM contacts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM conversations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcasts WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM departments WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM teams WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM team_members WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pending_account_users WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM campaigns WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM broadcast_jobs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automations WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automation_logs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM automation_pending_executions WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flows WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM flow_runs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM pipelines WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM deals WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM message_templates WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM tags WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM custom_fields WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM contact_notes WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM api_keys WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM webhook_endpoints WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM quick_replies WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM notifications WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_configs WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_knowledge_documents WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_knowledge_chunks WHERE account_id = v_old_account_id
    UNION ALL SELECT 1 FROM ai_usage_log WHERE account_id = v_old_account_id
    LIMIT 1
  ) INTO v_has_data;

  IF v_has_data THEN
    RAISE EXCEPTION 'Your account already contains data; sign up with a different email to join this one'
      USING ERRCODE = '23505';
  END IF;

  UPDATE profiles
  SET account_id = v_inv.account_id,
      account_role = v_inv.role
  WHERE user_id = v_caller_id;

  UPDATE account_invitations
  SET accepted_at = NOW(),
      accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  DELETE FROM accounts WHERE id = v_old_account_id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
