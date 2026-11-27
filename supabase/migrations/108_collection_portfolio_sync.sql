-- Durable current portfolio, semantic events and one daily position per contract.
-- Authenticated administrators can read; only the server can import financial data.
CREATE TABLE public.collection_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_revision text NOT NULL, settings_updated_at timestamptz NOT NULL, requested_by uuid REFERENCES auth.users(id),
  state text NOT NULL DEFAULT 'running' CHECK(state IN ('running','succeeded','failed')),
  lease_token uuid NOT NULL DEFAULT gen_random_uuid(), expires_at timestamptz NOT NULL DEFAULT now()+interval '20 minutes',
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, error text, total_contracts integer,
  UNIQUE(account_id,id)
);
CREATE UNIQUE INDEX one_collection_sync_running ON public.collection_sync_runs(account_id) WHERE state='running';
CREATE TABLE public.collection_contracts (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE, source_revision text NOT NULL, contract_key text NOT NULL,
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'), last_run_id uuid NOT NULL REFERENCES public.collection_sync_runs(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,source_revision,contract_key)
);
CREATE TABLE public.collection_contract_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source_revision text NOT NULL, contract_key text NOT NULL, run_id uuid NOT NULL REFERENCES public.collection_sync_runs(id),
  event_key text NOT NULL, kind text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,source_revision,contract_key,run_id,event_key)
);
CREATE INDEX collection_event_history ON public.collection_contract_events(account_id,source_revision,contract_key,created_at DESC);
CREATE TABLE public.collection_daily_positions (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE, source_revision text NOT NULL, contract_key text NOT NULL,
  position_date date NOT NULL, overdue_cents bigint NOT NULL, open_cents bigint NOT NULL, financial_state text NOT NULL,
  run_id uuid NOT NULL REFERENCES public.collection_sync_runs(id), PRIMARY KEY(account_id,source_revision,contract_key,position_date)
);
CREATE TABLE public.collection_sync_records (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE, run_id uuid NOT NULL, contract_key text NOT NULL,
  data jsonb NOT NULL, events jsonb NOT NULL DEFAULT '[]', PRIMARY KEY(run_id,contract_key),
  FOREIGN KEY(account_id,run_id) REFERENCES public.collection_sync_runs(account_id,id) ON DELETE CASCADE
);
ALTER TABLE public.collection_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_contract_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_daily_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_sync_records ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.collection_sync_runs,public.collection_contracts,public.collection_contract_events,public.collection_daily_positions TO authenticated;
GRANT ALL ON public.collection_sync_runs,public.collection_contracts,public.collection_contract_events,public.collection_daily_positions,public.collection_sync_records TO service_role;
CREATE POLICY collection_runs_admin ON public.collection_sync_runs FOR SELECT TO authenticated USING(is_account_member(account_id,'admin'));
CREATE POLICY collection_contracts_admin ON public.collection_contracts FOR SELECT TO authenticated USING(is_account_member(account_id,'admin'));
CREATE POLICY collection_events_admin ON public.collection_contract_events FOR SELECT TO authenticated USING(is_account_member(account_id,'admin'));
CREATE POLICY collection_positions_admin ON public.collection_daily_positions FOR SELECT TO authenticated USING(is_account_member(account_id,'admin'));

CREATE FUNCTION public.start_collection_sync(p_account uuid,p_revision text,p_settings_updated_at timestamptz,p_user uuid)
RETURNS public.collection_sync_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result collection_sync_runs;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text,108));
  UPDATE collection_sync_runs SET state='failed',finished_at=now(),error='Execução interrompida: tempo de processamento excedido.' WHERE account_id=p_account AND state='running' AND expires_at<=now();
  IF EXISTS(SELECT 1 FROM collection_sync_runs WHERE account_id=p_account AND state='running') THEN RAISE EXCEPTION 'Uma sincronização já está em andamento.' USING ERRCODE='P0001'; END IF;
  INSERT INTO collection_sync_runs(account_id,source_revision,settings_updated_at,requested_by) VALUES(p_account,p_revision,p_settings_updated_at,p_user) RETURNING * INTO result;
  RETURN result;
END; $$;

CREATE FUNCTION public.apply_collection_sync(p_run uuid,p_token uuid,p_expected_count integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE job collection_sync_runs; item record; ev jsonb; amount integer:=0;
BEGIN
  SELECT * INTO job FROM collection_sync_runs WHERE id=p_run AND lease_token=p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Execução inválida.'; END IF;
  IF job.state='succeeded' THEN RETURN job.total_contracts; END IF;
  IF job.state<>'running' OR job.expires_at<=now() THEN RAISE EXCEPTION 'A sincronização perdeu a validade.'; END IF;
  PERFORM 1 FROM collection_portfolio_settings WHERE account_id=job.account_id AND updated_at=job.settings_updated_at FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuração alterada durante a sincronização.'; END IF;
  PERFORM 1 FROM uau_connections WHERE account_id=job.account_id AND revision::text=job.source_revision FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conexão alterada durante a sincronização.'; END IF;
  IF (SELECT count(*) FROM collection_sync_records WHERE run_id=p_run AND account_id=job.account_id)<>p_expected_count THEN RAISE EXCEPTION 'Retorno incompleto: a carteira anterior foi preservada.'; END IF;
  FOR item IN SELECT * FROM collection_sync_records WHERE run_id=p_run AND account_id=job.account_id LOOP
    INSERT INTO collection_contracts(account_id,source_revision,contract_key,data,last_run_id) VALUES(job.account_id,job.source_revision,item.contract_key,item.data,p_run)
    ON CONFLICT(account_id,source_revision,contract_key) DO UPDATE SET data=excluded.data,last_run_id=p_run,updated_at=now();
    FOR ev IN SELECT value FROM jsonb_array_elements(item.events) LOOP
      INSERT INTO collection_contract_events(account_id,source_revision,contract_key,run_id,event_key,kind,detail)
      VALUES(job.account_id,job.source_revision,item.contract_key,p_run,ev->>'key',ev->>'kind',coalesce(ev->'detail','{}')) ON CONFLICT DO NOTHING;
    END LOOP;
    INSERT INTO collection_daily_positions(account_id,source_revision,contract_key,position_date,overdue_cents,open_cents,financial_state,run_id)
    VALUES(job.account_id,job.source_revision,item.contract_key,(item.data->>'referenceDate')::date,(item.data->>'overdueCents')::bigint,(item.data->>'openCents')::bigint,item.data->>'state',p_run)
    ON CONFLICT(account_id,source_revision,contract_key,position_date) DO UPDATE SET overdue_cents=excluded.overdue_cents,open_cents=excluded.open_cents,financial_state=excluded.financial_state,run_id=p_run;
    amount:=amount+1;
  END LOOP;
  UPDATE collection_sync_runs SET state='succeeded',finished_at=now(),total_contracts=amount WHERE id=p_run;
  DELETE FROM collection_sync_records WHERE run_id=p_run;
  RETURN amount;
END; $$;
REVOKE ALL ON FUNCTION public.start_collection_sync(uuid,text,timestamptz,uuid),public.apply_collection_sync(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_collection_sync(uuid,text,timestamptz,uuid),public.apply_collection_sync(uuid,uuid,integer) TO service_role;
