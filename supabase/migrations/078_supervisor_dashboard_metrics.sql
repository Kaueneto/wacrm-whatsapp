-- Operational analytics for a supervisor's department memberships.
CREATE FUNCTION public.supervisor_dashboard_metrics(p_days integer, p_tz text DEFAULT 'UTC')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_account uuid;
  v_department_ids uuid[];
  v_team_ids uuid[];
  v_tz text := 'UTC';
  v_now timestamptz := now();
  v_start timestamptz;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_unit text;
  v_step interval;
  v_target integer;
  v_attention jsonb;
  v_replies jsonb;
  v_volume jsonb;
  v_kpis jsonb;
  v_broadcasts jsonb;
BEGIN
  SELECT p.account_id INTO v_account FROM profiles p
    WHERE p.user_id = auth.uid() AND p.account_role = 'supervisor';
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'Supervisor access is required' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(DISTINCT t.department_id) INTO v_department_ids
  FROM team_members m
  JOIN teams t ON t.id = m.team_id AND t.account_id = m.account_id
  WHERE m.account_id = v_account AND m.user_id = auth.uid();
  SELECT array_agg(t.id) INTO v_team_ids FROM teams t
  WHERE t.account_id = v_account AND t.department_id = ANY(v_department_ids);

  IF p_days IS NULL OR p_days NOT IN (1, 7, 30, 90) THEN
    RAISE EXCEPTION 'p_days must be one of 1, 7, 30, 90' USING ERRCODE = '22023';
  END IF;

  IF p_tz IS NOT NULL THEN
    BEGIN
      PERFORM v_now AT TIME ZONE p_tz;
      v_tz := p_tz;
    EXCEPTION WHEN invalid_parameter_value THEN
      v_tz := 'UTC';
    END;
  END IF;

  v_start := (date_trunc('day', v_now AT TIME ZONE v_tz) - make_interval(days => p_days - 1)) AT TIME ZONE v_tz;
  v_prev_start := v_start - make_interval(days => p_days);
  v_prev_end := v_now - make_interval(days => p_days);
  v_unit := CASE WHEN p_days = 1 THEN 'hour' ELSE 'day' END;
  v_step := CASE WHEN p_days = 1 THEN interval '1 hour' ELSE interval '1 day' END;

  SELECT a.reply_target_minutes INTO v_target FROM accounts a WHERE a.id = v_account;
  v_target := COALESCE(v_target, 5);

  WITH awaiting AS (
    SELECT
      c.id,
      c.contact_id,
      c.assigned_agent_id,
      c.last_message_text,
      c.last_inbound_at,
      (c.ai_autoreply_disabled AND c.ai_handoff_summary IS NOT NULL) AS handed_off,
      COALESCE((
        SELECT min(m.created_at)
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.sender_type = 'customer'
          AND m.created_at > COALESCE(c.last_reply_at, '-infinity'::timestamptz)
      ), c.last_inbound_at) AS waiting_since
    FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) c
    WHERE c.account_id = v_account
      AND c.status <> 'closed'
      AND c.last_inbound_at IS NOT NULL
      AND (c.last_reply_at IS NULL OR c.last_reply_at < c.last_inbound_at)
  ),
  failed AS (
    SELECT m.id, m.conversation_id, m.content_text, m.error_code, m.error_title, m.created_at,
           ct.name AS contact_name, ct.phone AS contact_phone
    FROM messages m
    JOIN (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) c ON c.id = m.conversation_id
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.account_id = v_account
      AND m.sender_type <> 'customer'
      AND m.status = 'failed'
      AND m.created_at >= v_now - interval '24 hours'
  )
  SELECT jsonb_build_object(
    'waiting', (SELECT count(*) FROM awaiting),
    'oldestWaitingSince', (SELECT min(waiting_since) FROM awaiting),
    'waitingOverTarget', (SELECT count(*) FROM awaiting WHERE waiting_since < v_now - make_interval(mins => v_target)),
    'unassigned', (
      SELECT count(*) FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) c
      WHERE c.account_id = v_account AND c.status <> 'closed' AND c.assigned_agent_id IS NULL
    ),
    'windowsClosing', (
      SELECT count(*) FROM awaiting
      WHERE last_inbound_at > v_now - interval '24 hours'
        AND last_inbound_at <= v_now - interval '22 hours'
    ),
    'failed', (SELECT count(*) FROM failed),
    'failedMessages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', f.id,
        'conversationId', f.conversation_id,
        'contactName', f.contact_name,
        'contactPhone', f.contact_phone,
        'preview', left(f.content_text, 120),
        'errorCode', f.error_code,
        'errorTitle', f.error_title,
        'at', f.created_at
      ) ORDER BY f.created_at DESC)
      FROM (SELECT * FROM failed ORDER BY created_at DESC LIMIT 10) f
    ), '[]'::jsonb),
    'queue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'conversationId', q.id,
        'contactName', ct.name,
        'contactPhone', ct.phone,
        'avatarUrl', ct.avatar_url,
        'preview', left(q.last_message_text, 120),
        'waitingSince', q.waiting_since,
        'windowClosesAt', q.last_inbound_at + interval '24 hours',
        'assignedAgentId', q.assigned_agent_id,
        'handedOff', COALESCE(q.handed_off, false)
      ) ORDER BY q.waiting_since)
      FROM (SELECT * FROM awaiting ORDER BY waiting_since LIMIT 6) q
      LEFT JOIN contacts ct ON ct.id = q.contact_id
    ), '[]'::jsonb)
  ) INTO v_attention;

  WITH msgs AS (
    SELECT m.id, m.conversation_id, m.sender_type, m.ai_generated, m.status, m.created_at
    FROM messages m
    JOIN (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) c ON c.id = m.conversation_id
    WHERE c.account_id = v_account
      AND m.created_at >= v_prev_start - interval '1 day'
  ),
  streams AS (
    SELECT
      'human'::text AS kind,
      conversation_id,
      created_at,
      sender_type = 'customer' AS is_customer,
      lag(sender_type = 'customer') OVER (PARTITION BY conversation_id ORDER BY created_at, id) AS prev_customer
    FROM msgs
    WHERE sender_type = 'customer' OR (sender_type = 'agent' AND status <> 'failed')
    UNION ALL
    SELECT
      'ai'::text,
      conversation_id,
      created_at,
      sender_type = 'customer',
      lag(sender_type = 'customer') OVER (PARTITION BY conversation_id ORDER BY created_at, id)
    FROM msgs
    WHERE sender_type = 'customer' OR (ai_generated AND status <> 'failed')
  ),
  turns AS (
    SELECT
      s.kind,
      s.created_at AS asked_at,
      r.sender_id AS reply_agent,
      extract(epoch FROM r.created_at - s.created_at) / 60.0 AS minutes
    FROM streams s
    CROSS JOIN LATERAL (
      SELECT m2.sender_id, m2.created_at
      FROM messages m2
      WHERE m2.conversation_id = s.conversation_id
        AND m2.created_at > s.created_at
        AND m2.status <> 'failed'
        AND CASE WHEN s.kind = 'human' THEN m2.sender_type = 'agent' ELSE m2.ai_generated END
      ORDER BY m2.created_at, m2.id
      LIMIT 1
    ) r
    WHERE s.is_customer
      AND s.prev_customer IS NOT TRUE
      AND s.created_at >= v_prev_start
  ),
  members AS (
    SELECT p.user_id, p.full_name, p.avatar_url, p.account_role,
           jsonb_agg(jsonb_build_object('department', d.name, 'team', t.name) ORDER BY d.name, t.name) AS memberships
    FROM profiles p
    JOIN team_members tm ON tm.user_id = p.user_id AND tm.account_id = p.account_id
    JOIN teams t ON t.id = tm.team_id AND t.account_id = tm.account_id
    JOIN departments d ON d.id = t.department_id AND d.account_id = t.account_id
    WHERE p.account_id = v_account AND t.id = ANY(v_team_ids)
    GROUP BY p.user_id, p.full_name, p.avatar_url, p.account_role
  )
  SELECT jsonb_build_object(
    'averageHuman', (SELECT avg(minutes) FROM turns WHERE kind = 'human' AND asked_at >= v_start),
    'averageHumanPrevious', (SELECT avg(minutes) FROM turns WHERE kind = 'human' AND asked_at >= v_prev_start AND asked_at < v_prev_end),
    'medianHuman', (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
      FROM turns WHERE kind = 'human' AND asked_at >= v_start
    ),
    'medianHumanPrevious', (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
      FROM turns WHERE kind = 'human' AND asked_at >= v_prev_start AND asked_at < v_prev_end
    ),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'userId', mb.user_id,
        'name', mb.full_name,
        'avatarUrl', mb.avatar_url,
        'role', mb.account_role,
        'memberships', mb.memberships,
        'resolved', (
          SELECT count(*) FROM conversations c
          WHERE c.account_id = v_account AND c.team_id = ANY(v_team_ids)
            AND c.status = 'closed' AND c.closed_at >= v_start AND c.assigned_agent_id = mb.user_id
        ),
        'presence', mp.status,
        'lastSeenAt', mp.last_seen_at,
        'open', (
          SELECT count(*) FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) c
          WHERE c.account_id = v_account AND c.status <> 'closed' AND c.assigned_agent_id = mb.user_id
        ),
        'replies', (
          SELECT count(*) FROM turns
          WHERE kind = 'human' AND reply_agent = mb.user_id AND asked_at >= v_start
        ),
        'medianMinutes', (
          SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
          FROM turns
          WHERE kind = 'human' AND reply_agent = mb.user_id AND asked_at >= v_start
        )
      ) ORDER BY mb.full_name NULLS LAST)
      FROM members mb
      LEFT JOIN member_presence mp ON mp.user_id = mb.user_id AND mp.account_id = v_account
    ), '[]'::jsonb),
    'ai', jsonb_build_object(
      'replies', (
        SELECT count(*)
        FROM messages m
        JOIN (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) c ON c.id = m.conversation_id
        WHERE c.account_id = v_account AND m.ai_generated AND m.created_at >= v_start
      ),
      'medianMinutes', (
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes)
        FROM turns WHERE kind = 'ai' AND asked_at >= v_start
      )
    )
  ) INTO v_replies;

  WITH buckets AS (
    SELECT b
    FROM generate_series(
      date_trunc(v_unit, v_start AT TIME ZONE v_tz),
      date_trunc(v_unit, v_now AT TIME ZONE v_tz),
      v_step
    ) AS b
  ),
  period_msgs AS (
    SELECT m.sender_type, m.created_at AT TIME ZONE v_tz AS local_at
    FROM messages m
    JOIN (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) c ON c.id = m.conversation_id
    WHERE c.account_id = v_account
      AND m.created_at >= v_start
  ),
  msg_counts AS (
    SELECT date_trunc(v_unit, local_at) AS b,
           count(*) FILTER (WHERE sender_type = 'customer') AS incoming,
           count(*) FILTER (WHERE sender_type <> 'customer') AS outgoing
    FROM period_msgs
    GROUP BY 1
  ),
  conv_counts AS (
    SELECT date_trunc(v_unit, created_at AT TIME ZONE v_tz) AS b, count(*) AS n
    FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) AS scoped
    WHERE account_id = v_account AND created_at >= v_start
    GROUP BY 1
  ),
  resolved_counts AS (
    SELECT date_trunc(v_unit, closed_at AT TIME ZONE v_tz) AS b, count(*) AS n
    FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) AS scoped
    WHERE account_id = v_account AND status = 'closed' AND closed_at >= v_start
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        't', to_char(bk.b, 'YYYY-MM-DD"T"HH24:MI'),
        'incoming', COALESCE(mc.incoming, 0),
        'outgoing', COALESCE(mc.outgoing, 0),
        'newConversations', COALESCE(cc.n, 0),
        'resolved', COALESCE(rc.n, 0),
        'dealsWon', 0
      ) ORDER BY bk.b)
      FROM buckets bk
      LEFT JOIN msg_counts mc ON mc.b = bk.b
      LEFT JOIN conv_counts cc ON cc.b = bk.b
      LEFT JOIN resolved_counts rc ON rc.b = bk.b
    ), '[]'::jsonb),
    'hourly', (
      SELECT jsonb_agg(COALESCE(h.n, 0) ORDER BY hr.hour)
      FROM generate_series(0, 23) AS hr(hour)
      LEFT JOIN (
        SELECT extract(hour FROM local_at)::int AS hour, count(*) AS n
        FROM period_msgs
        WHERE sender_type = 'customer'
        GROUP BY 1
      ) h ON h.hour = hr.hour
    )
  ) INTO v_volume;

  SELECT jsonb_build_object(
    'newConversations', (
      SELECT count(*) FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) AS scoped
      WHERE account_id = v_account AND created_at >= v_start
    ),
    'newConversationsPrevious', (
      SELECT count(*) FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) AS scoped
      WHERE account_id = v_account AND created_at >= v_prev_start AND created_at < v_prev_end
    ),
    'resolved', (
      SELECT count(*) FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) AS scoped
      WHERE account_id = v_account AND status = 'closed' AND closed_at >= v_start
    ),
    'resolvedPrevious', (
      SELECT count(*) FROM (SELECT * FROM conversations WHERE team_id = ANY(v_team_ids)) AS scoped
      WHERE account_id = v_account AND status = 'closed' AND closed_at >= v_prev_start AND closed_at < v_prev_end
    ),
    'dealsWon', 0, 'dealsWonPrevious', 0, 'dealsWonValue', 0,
    'broadcastDelivered', (
      SELECT COALESCE(sum(delivered_count), 0) FROM broadcasts
      WHERE account_id = v_account AND department_id = ANY(v_department_ids) AND status IN ('sending', 'sent', 'completed', 'failed')
        AND COALESCE(scheduled_at, created_at) >= v_start
    ),
    'broadcastRead', (
      SELECT COALESCE(sum(read_count), 0) FROM broadcasts
      WHERE account_id = v_account AND department_id = ANY(v_department_ids) AND status IN ('sending', 'sent', 'completed', 'failed')
        AND COALESCE(scheduled_at, created_at) >= v_start
    ),
    'broadcastDeliveredPrevious', (
      SELECT COALESCE(sum(delivered_count), 0) FROM broadcasts
      WHERE account_id = v_account AND department_id = ANY(v_department_ids) AND status IN ('sending', 'sent', 'completed', 'failed')
        AND COALESCE(scheduled_at, created_at) >= v_prev_start
        AND COALESCE(scheduled_at, created_at) < v_prev_end
    ),
    'broadcastReadPrevious', (
      SELECT COALESCE(sum(read_count), 0) FROM broadcasts
      WHERE account_id = v_account AND department_id = ANY(v_department_ids) AND status IN ('sending', 'sent', 'completed', 'failed')
        AND COALESCE(scheduled_at, created_at) >= v_prev_start
        AND COALESCE(scheduled_at, created_at) < v_prev_end
    )
  ) INTO v_kpis;


  SELECT coalesce(jsonb_agg(to_jsonb(run) ORDER BY
    (run.state IN ('queued', 'running', 'paused')) DESC NULLS LAST, run.at DESC), '[]'::jsonb)
  INTO v_broadcasts
  FROM (
    SELECT b.id, b.name, d.name AS department, j.state, b.status,
           coalesce(b.scheduled_at, b.created_at) AS at,
           b.total_recipients AS recipients, b.delivered_count AS delivered,
           b.read_count AS read, b.replied_count AS replied, b.failed_count AS failed
    FROM broadcasts b
    JOIN departments d ON d.id = b.department_id AND d.account_id = b.account_id
    LEFT JOIN broadcast_jobs j ON j.broadcast_id = b.id AND j.account_id = b.account_id
    WHERE b.account_id = v_account AND b.department_id = ANY(v_department_ids)
      AND (coalesce(b.scheduled_at, b.created_at) >= v_start OR j.state IN ('queued', 'running', 'paused'))
    ORDER BY (j.state IN ('queued', 'running', 'paused')) DESC NULLS LAST,
             coalesce(b.scheduled_at, b.created_at) DESC, b.id
    LIMIT 20
  ) run;

  RETURN jsonb_build_object(
    'generatedAt', v_now, 'days', p_days, 'unit', v_unit, 'replyTargetMinutes', v_target,
    'attention', v_attention, 'replies', v_replies, 'volume', v_volume, 'kpis', v_kpis,
    'broadcasts', v_broadcasts, 'queues', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.department, q.team)
      FROM (
        SELECT t.id, t.name AS team, d.name AS department,
               count(*) FILTER (WHERE c.status = 'open') AS open,
               count(*) FILTER (WHERE c.status = 'pending') AS pending,
               count(*) FILTER (WHERE c.status = 'closed') AS closed,
               count(*) FILTER (WHERE c.status <> 'closed' AND c.assigned_agent_id IS NULL) AS unassigned,
               count(*) FILTER (WHERE c.status <> 'closed' AND c.last_inbound_at IS NOT NULL
                 AND (c.last_reply_at IS NULL OR c.last_reply_at < c.last_inbound_at)) AS waiting
        FROM teams t
        JOIN departments d ON d.id = t.department_id AND d.account_id = t.account_id
        LEFT JOIN conversations c ON c.team_id = t.id AND c.account_id = t.account_id
        WHERE t.account_id = v_account AND t.id = ANY(v_team_ids)
        GROUP BY t.id, t.name, d.name
      ) q
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.supervisor_dashboard_metrics(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_dashboard_metrics(integer, text) TO authenticated;
