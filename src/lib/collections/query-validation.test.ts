import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  validatePortfolioRows,
  pilotXml,
  parsePilot,
  validatePortfolioQueries,
} from './query-validation';
import { defaultPortfolioSetup } from './setup';
const plan = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn() }));
vi.mock('./query-plan', () => ({ createPortfolioPlan: plan.create }));

function cancelledContract() {
  return {
    VersaoContratoDados: 1,
    TipoRegistro: 'CONCILIACAO',
    CodEmpresa: 900,
    CodObra: '00001',
    Venda: 1,
    ChaveContrato: '900_00001_1',
    ContratoLocalizado: 1,
    NomeCliente: 'Cadastro de teste',
    DataReferenciaAtraso: '2026-11-26',
    DataCancelamentoEncontrada: '2026-11-26T00:00:00',
    UnidadesJson: '[]',
    ParcelasAbertasJson: '[]',
    RecebimentosJson: '[]',
    DistratosJson:
      '[{"StatusAprovacaoDistratoUAU":1,"DataAprovacaoDistratoUAU":"2026-11-26T00:00:00"}]',
    ManutencoesJson:
      '[{"NumeroHistorico":1,"TipoManutencaoUAU":4},{"NumeroHistorico":2,"TipoManutencaoUAU":4},{"NumeroHistorico":3,"TipoManutencaoUAU":13},{"NumeroHistorico":4,"TipoManutencaoUAU":0}]',
    EscopoParcelas: 'TODAS_ABERTAS',
    EnvioAutomaticoAutorizado: 0,
  };
}

describe('portfolio pilot evidence', () => {
  it('accepts an empty overdue table without inventing a paid contract', () => {
    expect(validatePortfolioRows([], 'open', 1)).toEqual([]);
  });
  it('keeps the cancelled contract visible in reconciliation without classifying it as paid', () => {
    const [row] = validatePortfolioRows(
      [cancelledContract()],
      'reconciliation',
      1
    );
    expect(row).toMatchObject({
      key: '900_00001_1',
      work: '00001',
      contractFound: true,
      openInstallments: 0,
      overdueInstallments: 0,
      baseOpen: 0,
      receipts: 0,
      confirmedReceipts: 0,
      cancellations: 1,
      maintenance: 4,
    });
    expect(row).not.toHaveProperty('paid');
  });
  it('does not silently treat a missing or invalid collection as an empty one', () => {
    for (const value of [undefined, null, '', '{invalid', '{}']) {
      expect(() =>
        validatePortfolioRows(
          [{ ...cancelledContract(), ParcelasAbertasJson: value }],
          'reconciliation',
          1
        )
      ).toThrow('ParcelasAbertasJson');
    }
  });
  it('keeps the future residual out of overdue after reversal of the cancellation', () => {
    const row = {
      ...cancelledContract(),
      DataCancelamentoEncontrada: null,
      DistratosJson: '[]',
      ManutencoesJson: '[{"NumeroHistorico":3,"TipoManutencaoUAU":13}]',
      ParcelasAbertasJson: JSON.stringify([
        {
          TipoParcela: 'E',
          NumeroParcela: 1,
          NumeroGeralParcela: 1,
          VencimentoOriginal: '2026-11-18T00:00:00',
          Prorrogacao: '2026-11-26T00:00:00',
          ValorBaseAbertoUAU: 314.43,
        },
        {
          TipoParcela: 'E',
          NumeroParcela: 51,
          NumeroGeralParcela: 55,
          VencimentoOriginal: '2026-11-28T00:00:00',
          Prorrogacao: '2026-11-28T00:00:00',
          ValorBaseAbertoUAU: 345.57,
        },
      ]),
    };
    expect(validatePortfolioRows([row], 'reconciliation', 1)[0]).toMatchObject({
      openInstallments: 2,
      overdueInstallments: 1,
      baseOpen: 660,
      cancellations: 0,
      receipts: 0,
    });
    const overdueOnly = {
      ...row,
      TipoRegistro: 'INADIMPLENCIA',
      EscopoParcelas: 'SOMENTE_VENCIDAS',
      ParcelasAbertasJson: JSON.stringify(
        JSON.parse(row.ParcelasAbertasJson).slice(0, 1)
      ),
      ManutencoesJson: '[]',
    };
    expect(validatePortfolioRows([overdueOnly], 'open', 1)[0]).toMatchObject({
      openInstallments: 1,
      overdueInstallments: 1,
      baseOpen: 314.43,
    });
  });
  it('preserves the work code and rejects characters that could change the XML or SQL literal', () => {
    expect(pilotXml({ company: 900, work: '00001', sale: 1 })).toBe(
      '<contratos><contrato empresa="900" obra="00001" venda="1" /></contratos>'
    );
    expect(() => pilotXml({ company: 900, work: "00001'", sale: 1 })).toThrow();
  });
});

describe('validation of real portfolio contracts', () => {
  const setup = () => ({
    ...defaultPortfolioSetup(),
    scope: {
      mode: 'selected' as const,
      projects: [{ company: '1', work: 'INPSG' }],
    },
  });
  const contract = () => ({
    ...cancelledContract(),
    CodEmpresa: 1,
    CodObra: 'INPSG',
    Venda: 25,
    ChaveContrato: '1_INPSG_25',
  });
  const discovery = () => ({
    ...contract(),
    TipoRegistro: 'INADIMPLENCIA',
    EscopoParcelas: 'SOMENTE_VENCIDAS',
  });
  beforeEach(() => {
    vi.resetAllMocks();
    plan.create.mockResolvedValue({ execute: plan.execute });
  });
  it('automatically reconciles a real contract discovered in the configured scope', async () => {
    plan.execute
      .mockResolvedValueOnce([discovery()])
      .mockResolvedValueOnce([contract()]);
    const result = await validatePortfolioQueries('account', setup());
    expect(plan.create).toHaveBeenCalledWith('account', setup());
    expect(plan.execute).toHaveBeenNthCalledWith(2, 'reconciliation', {
      contracts: [
        expect.objectContaining({ company: 1, work: 'INPSG', sale: 25 }),
      ],
    });
    expect(result.reconciliation[0].key).toBe('1_INPSG_25');
    expect(result.persisted).toBe(false);
  });
  it('does not invent a sample or run reconciliation when discovery is empty', async () => {
    plan.execute.mockResolvedValueOnce([]);
    const result = await validatePortfolioQueries('account', setup());
    expect(result.reconciliation).toEqual([]);
    expect(plan.execute).toHaveBeenCalledTimes(1);
  });
  it('validates company 900 in a temporary scope without modifying the portfolio scope', async () => {
    const original = setup();
    const before = structuredClone(original);
    plan.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cancelledContract()]);
    const result = await validatePortfolioQueries('account', original, {
      company: 900,
      work: '00001',
      sale: 1,
    });
    expect(plan.create).toHaveBeenCalledWith(
      'account',
      expect.objectContaining({
        scope: {
          mode: 'selected',
          projects: [{ company: '900', work: '00001' }],
        },
      })
    );
    expect(plan.execute).toHaveBeenNthCalledWith(2, 'reconciliation', {
      contracts: [{ company: 900, work: '00001', sale: 1 }],
    });
    expect(result.reconciliation[0].key).toBe('900_00001_1');
    expect(original).toEqual(before);
    expect(result.persisted).toBe(false);
  });
  it('allows read-only manual validation of an excluded project without changing exclusions', async () => {
    const original = {
      ...setup(),
      excludedCompanies: ['1'],
      excludedProjects: [{ company: '1', work: 'INPSG' }],
    };
    const before = structuredClone(original);
    plan.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([contract()]);
    await validatePortfolioQueries('account', original, {
      company: 1,
      work: 'INPSG',
      sale: 25,
    });
    expect(plan.create).toHaveBeenCalledWith(
      'account',
      expect.objectContaining({ excludedCompanies: [], excludedProjects: [] })
    );
    expect(original).toEqual(before);
  });
  it('chooses a discovered sale in a manual company/work scope when sale is omitted', async () => {
    const original = setup();
    const row = {
      ...cancelledContract(),
      TipoRegistro: 'INADIMPLENCIA',
      EscopoParcelas: 'SOMENTE_VENCIDAS',
    };
    plan.execute
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([cancelledContract()]);
    const result = await validatePortfolioQueries('account', original, {
      company: 900,
      work: '00001',
    });
    expect(plan.create).toHaveBeenCalledWith(
      'account',
      expect.objectContaining({
        scope: {
          mode: 'selected',
          projects: [{ company: '900', work: '00001' }],
        },
      })
    );
    expect(plan.execute).toHaveBeenNthCalledWith(2, 'reconciliation', {
      contracts: [
        expect.objectContaining({ company: 900, work: '00001', sale: 1 }),
      ],
    });
    expect(result.reconciliation[0].key).toBe('900_00001_1');
    expect(original.scope.projects).toEqual([{ company: '1', work: 'INPSG' }]);
  });
  it('does not invent a sale when the selected company/work has no overdue results', async () => {
    plan.execute.mockResolvedValueOnce([]);
    const result = await validatePortfolioQueries('account', setup(), {
      company: 900,
      work: '00001',
    });
    expect(result.reconciliation).toEqual([]);
    expect(plan.execute).toHaveBeenCalledTimes(1);
  });
  it('allows an omitted sale but rejects an invalid sale supplied explicitly', () => {
    expect(parsePilot({ company: 900, work: '00001' })).toMatchObject({
      company: 900,
      work: '00001',
    });
    for (const sale of [0, -1, null, '', '1', 1.5, 2147483648])
      expect(() => parsePilot({ company: 900, work: '00001', sale })).toThrow();
  });
  it('keeps exclusions active in automatic validation', async () => {
    plan.execute.mockResolvedValueOnce([discovery()]);
    await expect(
      validatePortfolioQueries('account', {
        ...setup(),
        excludedCompanies: ['1'],
      })
    ).rejects.toThrow('fora do escopo');
    expect(plan.execute).toHaveBeenCalledTimes(1);
  });
  it('rejects discovery queries that ignore the configured scope', async () => {
    plan.execute.mockResolvedValueOnce([
      { ...discovery(), CodEmpresa: 900, ChaveContrato: '900_INPSG_25' },
    ]);
    await expect(validatePortfolioQueries('account', setup())).rejects.toThrow(
      'fora do escopo'
    );
    expect(plan.execute).toHaveBeenCalledTimes(1);
  });
  it('can reconcile an explicit contract even without overdue discovery results', async () => {
    plan.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([contract()]);
    const result = await validatePortfolioQueries('account', setup(), {
      company: 1,
      work: 'INPSG',
      sale: 25,
    });
    expect(result.reconciliation).toHaveLength(1);
  });
  it('does not report success for a sale that UAU could not locate', async () => {
    plan.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...contract(), ContratoLocalizado: 0 }]);
    await expect(
      validatePortfolioQueries('account', setup(), {
        company: 1,
        work: 'INPSG',
        sale: 25,
      })
    ).rejects.toThrow('não foi localizada');
  });
});
