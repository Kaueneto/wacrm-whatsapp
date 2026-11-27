import { describe, expect, it } from 'vitest';
import {
  defaultPortfolioSetup,
  isExcludedProject,
  stagesForProject,
  parsePortfolioSetup,
} from './setup';
import { snapshotFromUau, collectionEvents, moneyCents } from './reconcile';
const setup = defaultPortfolioSetup();
const position = (
  amount: number,
  due = '2026-11-18',
  number = 1,
  general = 1
) => ({
  TipoParcela: 'E',
  NumeroParcela: number,
  NumeroGeralParcela: general,
  StatusParcelaUAU: 0,
  VencimentoOriginal: due + 'T00:00:00',
  Prorrogacao: '2026-11-27T00:00:00',
  ValorBaseAbertoUAU: amount,
});
const receipt = (amount: number) => ({
  TipoParcela: 'E',
  NumeroParcela: 1,
  NumeroGeralParcela: 1,
  NumeroRecebimento: 7,
  TipoRecebimentoUAU: 'E',
  StatusRecebimentoUAU: 1,
  DataRecebimentoUAU: '2026-11-27T00:00:00',
  ValorConf_Rec: amount,
});
function row(
  positions: unknown[] = [position(660)],
  receipts: unknown[] = [],
  patch = {}
) {
  return {
    VersaoContratoDados: 1,
    TipoRegistro: 'CONCILIACAO',
    CodEmpresa: 900,
    CodObra: '00001',
    Venda: 1,
    ChaveContrato: '900_00001_1',
    ContratoLocalizado: 1,
    QuantidadeClientesNasFontes: 1,
    CodCliente: 1,
    NomeCliente: 'Cadastro de teste',
    NomeObra: 'Obra de teste',
    DataReferenciaAtraso: '2026-11-27',
    DataCancelamentoEncontrada: null,
    EscopoParcelas: 'TODAS_ABERTAS',
    ParcelasAbertasJson: JSON.stringify(positions),
    RecebimentosJson: JSON.stringify(receipts),
    DistratosJson: '[]',
    ManutencoesJson: '[]',
    UnidadesJson: '[]',
    ...patch,
  };
}
describe('real portfolio reconciliation', () => {
  it('preserves the readable type and installment numbers returned by UAU', () => {
    const snapshot = snapshotFromUau(
      row([{ ...position(660), DescricaoTipoParcela: 'Entrada' }]),
      setup
    );
    expect(snapshot.positions[0]).toMatchObject({
      typeCode: 'E',
      typeName: 'Entrada',
      number: 1,
      generalNumber: 1,
    });
  });
  it('keeps debt in observation before the first stage of a project rule', () => {
    const custom = parsePortfolioSetup({
      ...setup,
      projectRules: [
        {
          id: 'later',
          name: 'Primeiro contato depois',
          company: '900',
          work: '00001',
          stages: [{ id: 'one', name: 'Contato', fromDay: 11 }],
        },
      ],
    });
    expect(snapshotFromUau(row(), custom)).toMatchObject({
      state: 'overdue',
      delay: 9,
      stageId: null,
      ruleName: 'Primeiro contato depois',
    });
  });
  it('ages the original due date even when extension is today', () => {
    expect(snapshotFromUau(row(), setup)).toMatchObject({
      state: 'overdue',
      delay: 9,
      overdueCents: 66000,
      openCents: 66000,
    });
  });
  it('preserves future residual after partial payment without marking it fully paid', () => {
    const before = snapshotFromUau(row(), setup);
    const after = snapshotFromUau(
      row([position(345.57, '2026-11-28', 51, 55)], [receipt(314.43)]),
      setup,
      before
    );
    expect(after).toMatchObject({
      state: 'current',
      openCents: 34557,
      overdueCents: 0,
    });
    expect(collectionEvents(before, after)).toContainEqual(
      expect.objectContaining({
        kind: 'receipt_confirmed',
        detail: expect.objectContaining({ principalDeltaCents: 31443 }),
      })
    );
  });
  it('records reversal and restores the overdue part without losing the residual', () => {
    const before = snapshotFromUau(
      row([position(345.57, '2026-11-28', 51, 55)], [receipt(314.43)]),
      setup
    );
    const after = snapshotFromUau(
      row([position(314.43), position(345.57, '2026-11-28', 51, 55)]),
      setup,
      before
    );
    expect(after).toMatchObject({
      state: 'overdue',
      overdueCents: 31443,
      openCents: 66000,
    });
    expect(collectionEvents(before, after)).toContainEqual(
      expect.objectContaining({
        kind: 'receipt_reversed',
        detail: expect.objectContaining({ principalDeltaCents: -31443 }),
      })
    );
  });
  it('only marks regularized when a new confirmed receipt covers the tracked overdue principal', () => {
    const before = snapshotFromUau(row(), setup);
    expect(snapshotFromUau(row([], [receipt(660)]), setup, before).state).toBe(
      'paid'
    );
    expect(snapshotFromUau(row([], []), setup, before).state).toBe('review');
  });
  it('never counts historical receipts as newly recovered on the initial import', () => {
    const after = snapshotFromUau(
      row([position(314.43)], [receipt(314.43)]),
      setup
    );
    expect(collectionEvents(undefined, after)).toEqual([
      expect.objectContaining({ kind: 'first_seen' }),
    ]);
  });
  it('blocks cancellation and records reactivation from current evidence rather than an old event', () => {
    const before = snapshotFromUau(
      row([], [], {
        DataCancelamentoEncontrada: '2026-11-26',
        DistratosJson:
          '[{"StatusAprovacaoDistratoUAU":1,"DataAprovacaoDistratoUAU":"2026-11-26"}]',
      }),
      setup
    );
    const after = snapshotFromUau(
      row([position(314.43)], [], {
        ManutencoesJson:
          '[{"NumeroHistorico":3,"TipoManutencaoUAU":13,"DataManutencaoUAU":"2026-11-26"}]',
      }),
      setup,
      before
    );
    expect(before.state).toBe('cancelled');
    expect(after.state).toBe('overdue');
    expect(collectionEvents(before, after)).toContainEqual(
      expect.objectContaining({
        kind: 'state_changed',
        detail: { from: 'cancelled', to: 'overdue' },
      })
    );
  });
  it('preserves the current state and creates no duplicate semantic event on an unchanged import', () => {
    const before = snapshotFromUau(row(), setup);
    const after = snapshotFromUau(row(), setup, before);
    expect(collectionEvents(before, after)).toEqual([]);
  });
  it('excludes an exact company/work without excluding another work of the same company', () => {
    const scoped = {
      ...setup,
      excludedProjects: [{ company: '900', work: '00001' }],
    };
    expect(isExcludedProject(scoped, '900', '00001')).toBe(true);
    expect(isExcludedProject(scoped, '900', '00002')).toBe(false);
    expect(snapshotFromUau(row(), scoped).state).toBe('excluded');
  });
  it('binds separate stage boundaries to exact projects and validates overlapping bindings', () => {
    const specific = {
      ...setup,
      projectRules: [
        {
          id: 'own',
          name: 'Cobrança especial',
          company: '900',
          work: '00001',
          stages: [
            { id: 'one', name: 'Inicial', fromDay: 1 },
            { id: 'two', name: 'Negociação', fromDay: 5 },
          ],
        },
      ],
    };
    expect(snapshotFromUau(row(), parsePortfolioSetup(specific))).toMatchObject(
      { stageId: 'two', ruleName: 'Cobrança especial' }
    );
    expect(stagesForProject(specific, '900', '00002')).toEqual(setup.stages);
    expect(() =>
      parsePortfolioSetup({
        ...specific,
        projectRules: [
          ...specific.projectRules,
          { ...specific.projectRules[0], id: 'other' },
        ],
      })
    ).toThrow();
  });
  it('does not interpret a pending receipt as confirmed payment', () => {
    const before = snapshotFromUau(row(), setup);
    const after = snapshotFromUau(
      row([], [{ ...receipt(660), StatusRecebimentoUAU: 0 }]),
      setup,
      before
    );
    expect(after.state).toBe('review');
  });
  it('rounds native six-decimal amounts with cents precision', () => {
    expect(moneyCents('314.430000')).toBe(31443);
    expect(moneyCents('1.005000')).toBe(101);
    expect(() => moneyCents(null)).toThrow();
  });
});
