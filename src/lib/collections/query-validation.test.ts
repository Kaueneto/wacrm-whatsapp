import { describe, expect, it } from 'vitest';
import { validatePortfolioRows, pilotXml } from './query-validation';

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
