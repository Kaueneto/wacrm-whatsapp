ALTER TABLE public.messages
  ADD COLUMN template_cost_context jsonb,
  ADD COLUMN template_department_id uuid;

CREATE FUNCTION public.capture_template_cost_department() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  SELECT t.department_id INTO NEW.template_department_id
  FROM public.conversations c
  JOIN public.teams t ON t.id = c.team_id AND t.account_id = c.account_id
  WHERE c.id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_template_cost_department BEFORE INSERT ON public.messages
  FOR EACH ROW WHEN (NEW.content_type = 'template' AND NEW.template_cost_context IS NOT NULL)
  EXECUTE FUNCTION public.capture_template_cost_department();

CREATE FUNCTION public.protect_template_cost_context() RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.template_cost_context := NULL;
      NEW.template_department_id := NULL;
    ELSE
      NEW.template_cost_context := OLD.template_cost_context;
      NEW.template_department_id := OLD.template_department_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_template_cost_context BEFORE INSERT OR UPDATE OF template_cost_context, template_department_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_template_cost_context();
REVOKE ALL ON FUNCTION public.capture_template_cost_department(), public.protect_template_cost_context() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.broadcast_cost_breakdown(
  p_start timestamptz, p_end timestamptz, p_time_zone text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_account uuid;
  v_role public.account_role_enum;
  v_departments uuid[];
BEGIN
  SELECT p.account_id, p.account_role INTO v_account, v_role
  FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_account IS NULL OR v_role NOT IN ('owner', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'Supervisor access is required' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start OR p_end - p_start > interval '32 days'
     OR p_time_zone IS NULL THEN
    RAISE EXCEPTION 'Invalid usage period' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT t.department_id) INTO v_departments
  FROM public.team_members m
  JOIN public.teams t ON t.id = m.team_id AND t.account_id = m.account_id
  WHERE m.account_id = v_account AND m.user_id = auth.uid();

  RETURN coalesce((
    WITH deliveries AS (
      SELECT coalesce(r.delivered_at, r.read_at) AS delivered_at,
             b.department_id, b.campaign_id, j.phone_number_id,
             upper(j.template_snapshot->>'category') AS category,
             b.template_name, b.template_language, 'broadcast'::text AS source
      FROM public.broadcasts b
      JOIN public.broadcast_recipients r ON r.broadcast_id = b.id
      LEFT JOIN public.broadcast_jobs j ON j.broadcast_id = b.id AND j.account_id = b.account_id
      WHERE b.account_id = v_account
        AND (v_role IN ('owner', 'admin') OR b.department_id = ANY(v_departments))
        AND r.status IN ('delivered', 'read', 'replied')
        AND coalesce(r.delivered_at, r.read_at) >= p_start
        AND coalesce(r.delivered_at, r.read_at) < p_end
      UNION ALL
      SELECT direct.* FROM (
        SELECT DISTINCT ON (m.message_id)
               coalesce(delivered.occurred_at, seen.occurred_at, m.created_at) AS delivered_at,
               m.template_department_id, NULL::uuid, m.template_cost_context->>'phone_number_id',
               upper(m.template_cost_context->>'category'), m.template_name,
               m.template_cost_context->>'language', 'direct'::text
        FROM public.conversations c
        JOIN public.messages m ON m.conversation_id = c.id
        LEFT JOIN public.broadcast_status_events delivered ON delivered.message_id = m.message_id AND delivered.status = 'delivered'
        LEFT JOIN public.broadcast_status_events seen ON seen.message_id = m.message_id AND seen.status = 'read'
        WHERE c.account_id = v_account
          AND (v_role IN ('owner', 'admin') OR m.template_department_id = ANY(v_departments))
          AND m.sender_type IN ('agent', 'bot') AND m.content_type = 'template'
          AND m.template_name IS NOT NULL AND m.message_id IS NOT NULL
          AND (m.status IN ('delivered', 'read') OR delivered.message_id IS NOT NULL OR seen.message_id IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM public.broadcast_recipients br
            JOIN public.broadcasts b ON b.id = br.broadcast_id
            WHERE br.whatsapp_message_id = m.message_id AND b.account_id = v_account
          )
        ORDER BY m.message_id, m.created_at, m.id
      ) direct
      WHERE direct.delivered_at >= p_start AND direct.delivered_at < p_end
    )
    SELECT jsonb_agg(to_jsonb(usage))
    FROM (
      SELECT (r.delivered_at AT TIME ZONE p_time_zone)::date AS day,
             r.department_id, d.name AS department_name, r.campaign_id, c.name AS campaign_name,
             r.phone_number_id, r.category, r.template_name, r.template_language,
             r.source, count(*) AS delivered
      FROM deliveries r
      LEFT JOIN public.departments d ON d.id = r.department_id AND d.account_id = v_account
      LEFT JOIN public.campaigns c ON c.id = r.campaign_id AND c.account_id = v_account
      GROUP BY 1, r.department_id, d.name, r.campaign_id, c.name,
        r.phone_number_id, r.category, r.template_name, r.template_language, r.source
    ) usage
  ), '[]'::jsonb);
END;
$$;
