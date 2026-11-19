-- Incremental processing progress: independent from delivery/read counters.
ALTER TABLE public.broadcasts ADD COLUMN processed_count integer;
CREATE FUNCTION public.broadcast_processing_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_done integer:=0; new_done integer:=0; bid uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN
    old_done:=CASE WHEN OLD.dispatch_state IN ('accepted','failed','unknown','cancelled') THEN 1 ELSE 0 END;
    bid:=OLD.broadcast_id;
  END IF;
  IF TG_OP<>'DELETE' THEN
    new_done:=CASE WHEN NEW.dispatch_state IN ('accepted','failed','unknown','cancelled') THEN 1 ELSE 0 END;
    bid:=NEW.broadcast_id;
  END IF;
  IF new_done<>old_done THEN
    UPDATE broadcasts SET processed_count=greatest(0,coalesce(processed_count,0)+new_done-old_done) WHERE id=bid;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER broadcast_processing_progress AFTER INSERT OR UPDATE OR DELETE ON public.broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_processing_progress();
CREATE FUNCTION public.initialize_broadcast_processing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE broadcasts SET processed_count=(SELECT count(*) FROM broadcast_recipients
    WHERE broadcast_id=NEW.broadcast_id AND (dispatch_state IN ('accepted','failed','unknown','cancelled') OR status<>'pending'))
    WHERE id=NEW.broadcast_id;
  RETURN NEW;
END $$;
CREATE TRIGGER initialize_broadcast_processing AFTER INSERT ON public.broadcast_jobs
  FOR EACH ROW EXECUTE FUNCTION public.initialize_broadcast_processing();

-- Existing recipient RLS permits operational writes. Queue/snapshot fields,
-- however, must only be changed through server/worker capabilities.
CREATE FUNCTION public.guard_broadcast_queue_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.role()='authenticated' THEN
    IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM broadcast_jobs WHERE broadcast_id=NEW.broadcast_id) THEN
      RAISE EXCEPTION 'Queue recipients are managed by the server' USING ERRCODE='42501';
    ELSIF TG_OP='UPDATE' AND (NEW.dispatch_state IS DISTINCT FROM OLD.dispatch_state OR
      NEW.dispatch_lease IS DISTINCT FROM OLD.dispatch_lease OR NEW.dispatch_lease_until IS DISTINCT FROM OLD.dispatch_lease_until OR
      NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count OR
      NEW.next_attempt_at IS DISTINCT FROM OLD.next_attempt_at OR NEW.phone_snapshot IS DISTINCT FROM OLD.phone_snapshot OR
      NEW.name_snapshot IS DISTINCT FROM OLD.name_snapshot OR NEW.template_params IS DISTINCT FROM OLD.template_params)
      AND EXISTS(SELECT 1 FROM broadcast_jobs WHERE broadcast_id=OLD.broadcast_id) THEN
      RAISE EXCEPTION 'Queue recipients are managed by the server' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_broadcast_queue_fields BEFORE INSERT OR UPDATE ON public.broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION public.guard_broadcast_queue_fields();
REVOKE ALL ON FUNCTION public.broadcast_processing_progress(),public.initialize_broadcast_processing(),public.guard_broadcast_queue_fields() FROM PUBLIC;
