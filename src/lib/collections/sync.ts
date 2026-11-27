import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import {
  getUauConnectionRevision,
  withUauReadSession,
} from '@/lib/uau/connection-store';
import { uauRows, detailedOpenInstallments } from '@/lib/uau/finance-normalize';
import { withCalculatedFinance } from './calculated-finance';
import { UauError } from '@/lib/uau/client';
import {
  parsePortfolioSetup,
  isExcludedProject,
  type PortfolioSetup,
} from './setup';
import { createPortfolioPlan, type ContractKey } from './query-plan';
import { validatePortfolioRows } from './query-validation';
import { snapshotFromUau, collectionEvents } from './reconcile';
import type { CollectionSnapshot, CollectionSummary } from './portfolio-types';

export interface SyncRun {
  id: string;
  account_id: string;
  source_revision: string;
  settings_updated_at: string;
  lease_token: string;
  state: string;
}
export function projectInScope(
  setup: PortfolioSetup,
  company: string,
  work: string
): boolean {
  return (
    !isExcludedProject(setup, company, work) &&
    (setup.scope.mode === 'all' ||
      setup.scope.projects.some(
        (p) =>
          p.company === company && p.work.toUpperCase() === work.toUpperCase()
      ))
  );
}
export async function loadPortfolioSetup(
  db: SupabaseClient,
  accountId: string
) {
  const { data, error } = await db
    .from('collection_portfolio_settings')
    .select('setup,updated_at')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error || !data)
    throw new UauError(
      'Salve a configuração da carteira antes de importar.',
      409
    );
  return {
    setup: parsePortfolioSetup(data.setup),
    updatedAt: String(data.updated_at),
  };
}
export async function readPortfolioContracts(
  db: SupabaseClient,
  accountId: string,
  revision: string,
  setup?: PortfolioSetup
): Promise<CollectionSnapshot[]> {
  const result: CollectionSnapshot[] = [];
  for (let start = 0; start < 100000; start += 1000) {
    let query = db
      .from('collection_contracts')
      .select('data')
      .eq('account_id', accountId)
      .eq('source_revision', revision);
    if (setup?.scope.mode === 'selected')
      query = query.in('data->>company', [
        ...new Set(setup.scope.projects.map((project) => project.company)),
      ]);
    const { data, error } = await query
      .order('contract_key')
      .range(start, start + 999);
    if (error)
      throw new UauError(
        'Não foi possível ler a carteira. Confira a migration 108.',
        503
      );
    result.push(
      ...(data ?? [])
        .map((row) => row.data as CollectionSnapshot)
        .filter((row) => !setup || projectInScope(setup, row.company, row.work))
    );
    if (!data || data.length < 1000) return result;
  }
  throw new UauError(
    'A carteira excedeu o limite de leitura desta versão.',
    422
  );
}
export async function beginPortfolioSync(
  accountId: string,
  userId: string,
  expectedSettingsUpdatedAt?: string
) {
  const db = supabaseAdmin();
  const settings = await loadPortfolioSetup(db, accountId);
  if (
    expectedSettingsUpdatedAt &&
    settings.updatedAt !== expectedSettingsUpdatedAt
  )
    throw new UauError(
      'A configuração foi alterada antes de iniciar o agendamento.',
      409
    );
  // Validate query metadata before creating a run or attempting any broad read.
  const plan = await createPortfolioPlan(accountId, settings.setup);
  const { data, error } = await db.rpc('start_collection_sync', {
    p_account: accountId,
    p_revision: plan.revision,
    p_settings_updated_at: settings.updatedAt,
    p_user: userId,
  });
  if (error)
    throw new UauError(
      error.code === 'P0001'
        ? 'Uma sincronização já está em andamento.'
        : 'Não foi possível iniciar a importação. Confira a migration 108.',
      409
    );
  const run = (Array.isArray(data) ? data[0] : data) as SyncRun | undefined;
  if (!run?.id || !run.lease_token || run.account_id !== accountId)
    throw new UauError('O banco não confirmou o início da importação.', 503);
  return { run, setup: settings.setup, plan };
}

/** Only card fields cross the list API; financial arrays load on demand. */
export async function readPortfolioCards(
  db: SupabaseClient,
  accountId: string,
  revision: string,
  setup?: PortfolioSetup
): Promise<CollectionSummary[]> {
  const projection =
    'key:data->>key,company:data->>company,work:data->>work,sale:data->sale,customer:data->>customer,project:data->>project,unit:data->>unit,referenceDate:data->>referenceDate,state:data->>state,delay:data->delay,overdueCents:data->overdueCents,openCents:data->openCents,overdueCount:data->overdueCount,cancellationDate:data->cancellationDate,stageId:data->stageId,ruleName:data->>ruleName,reason:data->reason,calculated:data->calculated';
  const result: CollectionSummary[] = [];
  for (let start = 0; start < 100000; start += 1000) {
    let query = db
      .from('collection_contracts')
      .select(projection)
      .eq('account_id', accountId)
      .eq('source_revision', revision);
    if (setup?.scope.mode === 'selected')
      query = query.in('data->>company', [
        ...new Set(setup.scope.projects.map((project) => project.company)),
      ]);
    const { data, error } = await query
      .order('contract_key')
      .range(start, start + 999);
    if (error) throw new UauError('Não foi possível ler a carteira.', 503);
    result.push(
      ...((data ?? []) as unknown as CollectionSummary[]).filter(
        (row) => !setup || projectInScope(setup, row.company, row.work)
      )
    );
    if (!data || data.length < 1000) return result;
  }
  throw new UauError('A carteira excede o limite desta versão.', 422);
}
export async function executePortfolioSync(
  job: Awaited<ReturnType<typeof beginPortfolioSync>>
) {
  const { run, setup, plan } = job,
    db = supabaseAdmin();
  try {
    const previous = await readPortfolioContracts(
        db,
        run.account_id,
        run.source_revision,
        setup
      ),
      old = new Map(previous.map((row) => [row.key, row]));
    const targets = new Map<string, ContractKey>();
    let reference: string | null = null;
    for (let page = 1; ; page++) {
      if (page > 2000)
        throw new UauError('A consulta ultrapassou o limite de páginas.', 422);
      const raw = await plan.execute('open', { page, size: 100 });
      const rows = validatePortfolioRows(raw, 'open', setup.minimumDays);
      if (rows.length > 100)
        throw new UauError('A consulta não respeitou a paginação.', 422);
      for (const row of rows) {
        if (reference && reference !== row.referenceDate)
          throw new UauError(
            'A data de referência mudou durante a leitura. Repita a importação.',
            409
          );
        reference = row.referenceDate;
        if (!projectInScope(setup, String(row.company), row.work))
          throw new UauError(
            'A consulta do UAU retornou contratos fora do escopo selecionado. Confira o filtro EmpresaObra da consulta. A carteira anterior foi preservada.',
            422
          );
        if (targets.has(row.key))
          throw new UauError(
            'A consulta repetiu contratos entre páginas. A carteira anterior foi preservada.',
            422
          );
        targets.set(row.key, {
          company: row.company,
          work: row.work,
          sale: row.sale,
        });
      }
      if (rows.length < 100) break;
    }
    for (const row of previous)
      if (projectInScope(setup, row.company, row.work))
        targets.set(row.key, {
          company: Number(row.company),
          work: row.work,
          sale: row.sale,
        });
    const progress = await db
      .from('collection_sync_runs')
      .update({
        total_contracts: targets.size,
      })
      .eq('id', run.id)
      .eq('account_id', run.account_id)
      .eq('lease_token', run.lease_token)
      .eq('state', 'running');
    if (progress.error)
      throw new UauError('Falha ao atualizar o progresso da importação.', 503);
    let staged = 0;
    async function stage(snapshots: CollectionSnapshot[]) {
      if (!snapshots.length) return;
      const { error } = await db.from('collection_sync_records').insert(
        snapshots.map((data) => ({
          account_id: run.account_id,
          run_id: run.id,
          contract_key: data.key,
          data,
          events: collectionEvents(old.get(data.key), data),
        }))
      );
      if (error)
        throw new UauError(
          `Não foi possível preparar o lote da carteira${error.code ? ` (código ${error.code})` : ': o banco não respondeu'}. A carteira anterior foi preservada.`,
          503
        );
      staged += snapshots.length;
      const renewed = await db
        .from('collection_sync_runs')
        .update({
          expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        })
        .eq('id', run.id)
        .eq('account_id', run.account_id)
        .eq('lease_token', run.lease_token)
        .eq('state', 'running')
        .gt('expires_at', new Date().toISOString())
        .select('id')
        .maybeSingle();
      if (renewed.error || !renewed.data)
        throw new UauError(
          'A execução foi interrompida. A posição anterior foi preservada.',
          409
        );
    }
    // Historical contracts outside the scope remain untouched. List/detail APIs
    // apply the current scope; importing one work must not rewrite other works.
    const list = [...targets.values()];
    async function reconcile(batch: ContractKey[]): Promise<void> {
      let raw;
      try {
        raw = await plan.execute('reconciliation', { contracts: batch });
      } catch (error) {
        if (
          error instanceof UauError &&
          ((error.status === 422 && error.message.includes('dados demais')) ||
            (error.status === 502 && !error.upstreamStatus)) &&
          batch.length > 1
        ) {
          const middle = Math.ceil(batch.length / 2);
          await reconcile(batch.slice(0, middle));
          await reconcile(batch.slice(middle));
          return;
        }
        throw error;
      }
      const normalized = validatePortfolioRows(raw, 'reconciliation', 1),
        expected = new Set(
          batch.map((p) => `${p.company}_${p.work}_${p.sale}`)
        );
      if (
        normalized.length !== batch.length ||
        normalized.some((row) => !expected.has(row.key))
      )
        throw new UauError(
          'A conciliação retornou um lote incompleto ou de outro contrato. A carteira anterior foi preservada.',
          422
        );
      if (
        normalized.some((row) => reference && reference !== row.referenceDate)
      )
        throw new UauError(
          'Datas diferentes na leitura da carteira. Repita a importação.',
          409
        );
      const snapshots = uauRows(raw).map((row) => {
        const key = String(row.ChaveContrato ?? row.chavecontrato);
        try {
          return snapshotFromUau(row, setup, old.get(key));
        } catch (error) {
          throw new UauError(
            `Contrato ${key}: ${error instanceof Error ? error.message : 'dados inconsistentes.'}`,
            422
          );
        }
      });
      // Small groups bound ERP load and renew the run lease between groups.
      for (let offset = 0; offset < snapshots.length; offset += 3) {
        const enriched = await withUauReadSession(
          run.account_id,
          async (read, revision) => {
            if (revision !== run.source_revision)
              throw new UauError(
                'A conexão UAU mudou. Repita a sincronização.',
                409
              );
            return Promise.all(
              snapshots.slice(offset, offset + 3).map(async (snapshot) => {
                if (!snapshot.positions.length)
                  return withCalculatedFinance(snapshot, []);
                try {
                  const raw = await read('Venda/BuscarParcelasAReceber', {
                    empresa: Number(snapshot.company),
                    obra: snapshot.work,
                    num_ven: snapshot.sale,
                    data_calculo: `${snapshot.referenceDate}T00:00:00-03:00`,
                    valor_presente: false,
                  });
                  const installments = detailedOpenInstallments(
                    raw,
                    {
                      key: snapshot.key,
                      company: Number(snapshot.company),
                      project: snapshot.work,
                      sale: snapshot.sale,
                      status: null,
                      units: [],
                    },
                    snapshot.referenceDate
                  );
                  return withCalculatedFinance(snapshot, installments);
                } catch (error) {
                  throw new UauError(
                    `Contrato ${snapshot.key}: não foi possível atualizar os valores calculados. ${error instanceof Error ? error.message : ''} A carteira anterior foi preservada.`,
                    502
                  );
                }
              })
            );
          }
        );
        await stage(enriched);
      }
    }
    for (let i = 0; i < list.length; i += 25)
      await reconcile(list.slice(i, i + 25));
    if (
      (await getUauConnectionRevision(run.account_id)) !== run.source_revision
    )
      throw new UauError('A conexão foi alterada antes da gravação.', 409);
    const { error } = await db.rpc('apply_collection_sync', {
      p_run: run.id,
      p_token: run.lease_token,
      p_expected_count: staged,
    });
    if (error)
      throw new UauError(
        [
          'Configuração alterada durante a sincronização.',
          'Conexão alterada durante a sincronização.',
          'A sincronização perdeu a validade.',
          'Retorno incompleto: a carteira anterior foi preservada.',
        ].includes(error.message)
          ? `${error.message} Repita a importação com a configuração atual.`
          : `Não foi possível aplicar a importação completa${error.code ? ` (código ${error.code})` : ''}. A carteira anterior foi preservada.`,
        409
      );
    return staged;
  } catch (error) {
    const message =
      error instanceof UauError
        ? error.message
        : 'Falha ao processar a carteira. A posição anterior foi preservada.';
    await db
      .from('collection_sync_runs')
      .update({
        state: 'failed',
        finished_at: new Date().toISOString(),
        error: message,
      })
      .eq('id', run.id)
      .eq('account_id', run.account_id)
      .eq('lease_token', run.lease_token)
      .eq('state', 'running');
    await db
      .from('collection_sync_records')
      .delete()
      .eq('run_id', run.id)
      .eq('account_id', run.account_id);
    throw error;
  }
}
