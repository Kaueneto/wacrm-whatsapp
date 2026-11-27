-- Organization-level draft only. Scheduling/execution is intentionally not enabled.
CREATE TABLE public.collection_portfolio_settings (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  setup jsonb NOT NULL CHECK (jsonb_typeof(setup) = 'object'),
  status text NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.collection_portfolio_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.collection_portfolio_settings TO authenticated;
GRANT ALL ON public.collection_portfolio_settings TO service_role;
CREATE POLICY portfolio_settings_admin ON public.collection_portfolio_settings
  FOR ALL TO authenticated
  USING (public.is_account_member(account_id, 'admin'))
  WITH CHECK (public.is_account_member(account_id, 'admin') AND updated_by = auth.uid());
COMMENT ON TABLE public.collection_portfolio_settings IS
  'Collection portfolio configuration draft. Saving does not run UAU queries, schedule syncs, or send messages.';
