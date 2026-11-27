import { after } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getUauConnectionRevision } from '@/lib/uau/connection-store';
import {
  beginPortfolioSync,
  executePortfolioSync,
  loadPortfolioSetup,
  readPortfolioCards,
  projectInScope,
} from '@/lib/collections/sync';
import { UauError } from '@/lib/uau/client';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { portfolioRunStatus } from '@/lib/collections/run-status';
const headers = { 'Cache-Control': 'no-store' };
export const runtime = 'nodejs';
function failed(error: unknown) {
  return error instanceof UauError
    ? Response.json({ error: error.message }, { status: error.status, headers })
    : toErrorResponse(error);
}
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const revision = await getUauConnectionRevision(accountId);
    if (!revision)
      return Response.json({ contracts: [], run: null }, { headers });
    const { data: storedRun, error } = await supabase
      .from('collection_sync_runs')
      .select(
        'id,state,started_at,finished_at,expires_at,error,total_contracts'
      )
      .eq('account_id', accountId)
      .eq('source_revision', revision)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new UauError(
        'Não foi possível ler o histórico de importações.',
        503
      );
    const run = portfolioRunStatus(storedRun);
    let prepared = 0;
    if (run?.state === 'running') {
      const staged = await supabaseAdmin()
        .from('collection_sync_records')
        .select('contract_key', { head: true, count: 'exact' })
        .eq('account_id', accountId)
        .eq('run_id', run.id);
      if (!staged.error) prepared = staged.count ?? 0;
    }
    if (new URL(request.url).searchParams.get('status') === '1')
      return Response.json(
        { run: run ? { ...run, prepared } : null },
        { headers }
      );
    const settings = await loadPortfolioSetup(supabase, accountId);
    const contracts = await readPortfolioCards(
      supabase,
      accountId,
      revision,
      settings.setup
    );
    return Response.json(
      {
        contracts: contracts.filter((c) =>
          projectInScope(settings.setup, c.company, c.work)
        ),
        run: run ? { ...run, prepared } : null,
      },
      { headers }
    );
  } catch (error) {
    return failed(error);
  }
}
export async function POST() {
  try {
    const { accountId, userId } = await requireRole('admin');
    const rate = checkRateLimit(`portfolio:import:${accountId}`, {
      limit: 3,
      windowMs: 60000,
    });
    if (!rate.success) return rateLimitResponse(rate);
    const job = await beginPortfolioSync(accountId, userId);
    after(async () => {
      try {
        await executePortfolioSync(job);
      } catch (error) {
        console.error(
          '[collection-sync]',
          error instanceof UauError ? error.message : 'Falha no processamento.'
        );
      }
    });
    return Response.json(
      { runId: job.run.id, state: 'running' },
      { status: 202, headers }
    );
  } catch (error) {
    return failed(error);
  }
}
