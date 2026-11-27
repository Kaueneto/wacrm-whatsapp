import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPortfolioSetup } from './setup';
import type { CollectionSnapshot } from './portfolio-types';
const mocked = vi.hoisted(() => ({
  admin: vi.fn(),
  revision: vi.fn(),
  session: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/lib/ai/admin-client', () => ({ supabaseAdmin: mocked.admin }));
vi.mock('@/lib/uau/connection-store', () => ({
  getUauConnectionRevision: mocked.revision,
  withUauReadSession: mocked.session,
}));
import { executePortfolioSync } from './sync';

function previous(
  company: string,
  work: string,
  sale: number
): CollectionSnapshot {
  return {
    key: company + '_' + work + '_' + sale,
    company,
    work,
    sale,
    customer: 'Fixture',
    project: 'Fixture',
    unit: '',
    referenceDate: '2026-11-27',
    state: 'overdue',
    delay: 1,
    overdueCents: 100,
    openCents: 100,
    overdueCount: 1,
    positions: [],
    receipts: [],
    maintenance: [],
    cancellations: [],
    cancellationDate: null,
    stageId: 'initial',
    ruleName: 'Padrão',
    reason: null,
  };
}
function uau(
  sale: number,
  kind: 'open' | 'reconciliation',
  company = 900,
  work = '00001'
) {
  return {
    VersaoContratoDados: 1,
    TipoRegistro: kind === 'open' ? 'INADIMPLENCIA' : 'CONCILIACAO',
    EscopoParcelas: kind === 'open' ? 'SOMENTE_VENCIDAS' : 'TODAS_ABERTAS',
    CodEmpresa: company,
    CodObra: work,
    Venda: sale,
    ChaveContrato: company + '_' + work + '_' + sale,
    ContratoLocalizado: 1,
    QuantidadeClientesNasFontes: 1,
    CodCliente: 1,
    NomeCliente: 'Fixture',
    DataReferenciaAtraso: '2026-11-27',
    UnidadesJson: '[]',
    ParcelasAbertasJson: '[]',
    RecebimentosJson: '[]',
    DistratosJson: '[]',
    ManutencoesJson: '[]',
  };
}
function harness(prior: CollectionSnapshot[]) {
  const setup = defaultPortfolioSetup();
  setup.scope = {
    mode: 'selected',
    projects: [{ company: '900', work: '00001' }],
  };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const key of ['select', 'eq', 'gt', 'order', 'in'])
    chain[key] = vi.fn(() => chain);
  chain.range = vi
    .fn()
    .mockResolvedValue({ data: prior.map((data) => ({ data })), error: null });
  const lease: Record<string, unknown> = {};
  for (const key of ['eq', 'gt', 'select']) lease[key] = vi.fn(() => lease);
  lease.maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: { id: 'run' }, error: null });
  lease.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ error: null }).then(resolve);
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => lease);
  const rpc = vi.fn().mockResolvedValue({ error: null });
  mocked.admin.mockReturnValue({
    from: vi.fn((table: string) =>
      table === 'collection_contracts'
        ? chain
        : table === 'collection_sync_records'
          ? { insert, delete: vi.fn(() => lease) }
          : { update }
    ),
    rpc,
  });
  mocked.revision.mockResolvedValue('revision');
  const execute = vi.fn().mockResolvedValue([]);
  const job = {
    run: {
      id: 'run',
      account_id: 'account',
      source_revision: 'revision',
      settings_updated_at: '2026-11-27',
      lease_token: 'lease',
      state: 'running',
    },
    setup,
    plan: { revision: 'revision', execute },
  };
  return { job, insert, update, rpc, execute, chain };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocked.session.mockImplementation((_account, callback) =>
    callback(mocked.read, 'revision')
  );
});
describe('strict import scope', () => {
  it('stores ERP calculated amounts alongside base balances before publishing', async () => {
    const h = harness([]);
    const row = uau(1, 'reconciliation');
    row.ParcelasAbertasJson = JSON.stringify([
      {
        TipoParcela: 'P',
        NumeroParcela: 51,
        NumeroGeralParcela: 51,
        VencimentoOriginal: '2026-11-10',
        ValorBaseAbertoUAU: 499,
        StatusParcelaUAU: 0,
      },
    ]);
    h.execute
      .mockResolvedValueOnce([uau(1, 'open')])
      .mockResolvedValueOnce([row]);
    mocked.read.mockResolvedValue([
      {
        Empresa_prc: 900,
        Obra_Prc: '00001',
        NumVend_prc: 1,
        Tipo_prc: 'P',
        NumParc_prc: 51,
        NumParcGer_prc: 51,
        Data_prc: '2026-11-10',
        Valor_prc: 499,
        ValorReaj: 741.31,
        vlrCorrecao: 223.76,
        vlrJurosAtraso: 4.09,
        ValorMulta: 14.46,
      },
    ]);
    expect(await executePortfolioSync(h.job)).toBe(1);
    expect(h.insert.mock.calls[0][0][0].data).toMatchObject({
      overdueCents: 49900,
      calculated: { overduePrincipalCents: 72276, overdueTotalCents: 74131 },
    });
    expect(mocked.read).toHaveBeenCalledWith('Venda/BuscarParcelasAReceber', {
      empresa: 900,
      obra: '00001',
      num_ven: 1,
      data_calculo: '2026-11-27T00:00:00-03:00',
      valor_presente: false,
    });
  });
  it('preserves the old portfolio when calculated finance cannot be read', async () => {
    const h = harness([]);
    const row = uau(1, 'reconciliation');
    row.ParcelasAbertasJson = JSON.stringify([
      {
        TipoParcela: 'P',
        NumeroParcela: 1,
        NumeroGeralParcela: 1,
        VencimentoOriginal: '2026-11-10',
        ValorBaseAbertoUAU: 499,
        StatusParcelaUAU: 0,
      },
    ]);
    h.execute
      .mockResolvedValueOnce([uau(1, 'open')])
      .mockResolvedValueOnce([row]);
    mocked.read.mockRejectedValueOnce(new Error('UAU indisponível'));
    await expect(executePortfolioSync(h.job)).rejects.toThrow(
      'carteira anterior foi preservada'
    );
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('leaves 2,122 historical contracts untouched and imports only the two selected test sales', async () => {
    const old = Array.from({ length: 2122 }, (_, i) =>
      previous('1', 'INPSG', i + 1)
    );
    // The database filter normally avoids these rows; app validation is a second boundary.
    const h = harness([...old, previous('900', '00001', 1)]);
    h.chain.range
      .mockResolvedValueOnce({
        data: old.slice(0, 1000).map((data) => ({ data })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: old.slice(1000, 2000).map((data) => ({ data })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [...old.slice(2000), previous('900', '00001', 1)].map((data) => ({
          data,
        })),
        error: null,
      });
    h.execute
      .mockResolvedValueOnce([uau(1, 'open'), uau(2, 'open')])
      .mockResolvedValueOnce([
        uau(1, 'reconciliation'),
        uau(2, 'reconciliation'),
      ]);
    expect(await executePortfolioSync(h.job)).toBe(2);
    expect(h.chain.in).toHaveBeenCalledWith('data->>company', ['900']);
    expect(h.update).toHaveBeenCalledWith({ total_contracts: 2 });
    expect(h.insert).toHaveBeenCalledTimes(1);
    expect(
      h.insert.mock.calls[0][0].map(
        (record: { contract_key: string }) => record.contract_key
      )
    ).toEqual(['900_00001_1', '900_00001_2']);
    expect(h.execute).toHaveBeenNthCalledWith(2, 'reconciliation', {
      contracts: [
        { company: 900, work: '00001', sale: 1 },
        { company: 900, work: '00001', sale: 2 },
      ],
    });
    expect(h.rpc).toHaveBeenCalledWith('apply_collection_sync', {
      p_run: 'run',
      p_token: 'lease',
      p_expected_count: 2,
    });
  });
  it('does not stage or count old out-of-scope contracts when the selected work has no targets', async () => {
    const h = harness([previous('1', 'INPSG', 1)]);
    expect(await executePortfolioSync(h.job)).toBe(0);
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({ total_contracts: 0 });
  });
  it('stops a UAU query that ignores the selected scope before staging anything', async () => {
    const h = harness([]);
    h.execute.mockResolvedValueOnce([uau(1, 'open', 1, 'INPSG')]);
    await expect(executePortfolioSync(h.job)).rejects.toThrow('fora do escopo');
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('preserves the database error code when staging fails and never publishes the partial run', async () => {
    const h = harness([]);
    h.execute
      .mockResolvedValueOnce([uau(1, 'open')])
      .mockResolvedValueOnce([uau(1, 'reconciliation')]);
    h.insert.mockResolvedValueOnce({ error: { code: '23505' } });
    await expect(executePortfolioSync(h.job)).rejects.toThrow('23505');
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'failed',
        error: expect.stringContaining('23505'),
      })
    );
  });
});
