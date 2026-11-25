-- Auth is authoritative: email changes only reach profiles once confirmed.
CREATE FUNCTION public.sync_profile_auth_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
    UPDATE public.profiles SET email = NEW.email
      WHERE user_id = NEW.id AND email IS DISTINCT FROM NEW.email;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_profile_auth_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_profile_auth_email
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_auth_email();

-- Repair profiles whose confirmed login address changed before this trigger.
UPDATE public.profiles p SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND u.email IS NOT NULL AND p.email IS DISTINCT FROM u.email;
