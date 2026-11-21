-- Preserve the original due time before enqueue_broadcast advances next_run_at.
CREATE FUNCTION public.capture_campaign_due_time() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL AND NEW.scheduled_at IS NULL THEN
    SELECT next_run_at INTO NEW.scheduled_at FROM campaigns
      WHERE id=NEW.campaign_id AND scheduler_lease IS NOT NULL AND next_run_at<=now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER capture_campaign_due_time BEFORE INSERT ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.capture_campaign_due_time();
REVOKE ALL ON FUNCTION public.capture_campaign_due_time() FROM PUBLIC;
