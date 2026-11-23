-- updated_at also changes when execution counters advance. Do not present that
-- runtime timestamp as an authored edit. Existing flows have no reliable history.
ALTER TABLE public.flows ADD COLUMN last_edited_at timestamptz;
ALTER TABLE public.flows ALTER COLUMN last_edited_at SET DEFAULT now();

CREATE FUNCTION public.track_flow_edit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.last_edited_at := now();
  RETURN NEW;
END;
$$;

-- replace_flow_graph updates these fields in the same transaction as the nodes,
-- even when only node configuration or canvas positions were changed.
CREATE TRIGGER track_flow_edit BEFORE UPDATE OF
  name, description, status, trigger_type, trigger_config, entry_node_id, fallback_policy
ON public.flows FOR EACH ROW EXECUTE FUNCTION public.track_flow_edit();
