import { describe, it, expect } from 'vitest';
import {
  withCalculatedFinance,
  calculatedPortfolioTotals,
} from './calculated-finance';
import { detailedOpenInstallments } from '@/lib/uau/finance-normalize';
import type { CollectionSnapshot } from './portfolio-types';

const contract = {
  key: '14_TGLII_31',
  company: 14,
  project: 'TGLII',
  sale: 31,
  status: null,
  units: [],
};
const raw = {
  Empresa_prc: 14,
  Obra_Prc: 'TGLII',
  NumVend_prc: 31,
  Tipo_prc: 'P',
  NumParc_prc: 51,
  NumParcGer_prc: 51,
  Data_prc: '2026-11-10',
  Valor_prc: 499,
  ValorReaj: 741.31,
  vlrCorrecao: 223.76,
  vlrCorrecaoEmb: 223.76,
  vlrCorrecaoAtra: 0,
  vlrJurosAtraso: 4.09,
  ValorMulta: 14.46,
};
const items = (rows = [raw]) =>
  detailedOpenInstallments(rows, contract, '2026-11-27');
const snapshot = {
  ...contract,
  company: '14',
  work: 'TGLII',
  state: 'overdue',
  referenceDate: '2026-11-27',
  overdueCents: 49900,
  openCents: 49900,
  positions: [
    {
      key: 'P_51_51',
      due: '2026-11-10',
      cents: 49900,
      extension: null,
      status: 0,
    },
  ],
} as unknown as CollectionSnapshot;

describe('calculated portfolio amounts', () => {
  it('matches the real Valcemar example without adding embedded correction or charges twice', () => {
    const enriched = withCalculatedFinance(snapshot, items());
    expect(enriched.calculated).toMatchObject({
      overduePrincipalCents: 72276,
      openPrincipalCents: 72276,
      overdueTotalCents: 74131,
      openTotalCents: 74131,
      referenceDate: '2026-11-27',
    });
    expect(enriched.overdueCents).toBe(49900);
    expect(items()[0].lateCorrectionCents).toBe(0);
  });
  it('keeps future amounts out of overdue totals', () => {
    const future = {
      ...raw,
      NumParc_prc: 52,
      NumParcGer_prc: 52,
      Data_prc: '2026-12-10',
      ValorReaj: 722.76,
    };
    const enriched = withCalculatedFinance(
      {
        ...snapshot,
        positions: [
          ...snapshot.positions,
          { ...snapshot.positions[0], key: 'P_52_52', due: '2026-12-10' },
        ],
      },
      items([raw, future])
    );
    expect(enriched.calculated).toMatchObject({
      overdueTotalCents: 74131,
      openTotalCents: 146407,
      openPrincipalCents: 144552,
    });
  });
  it('keeps late correction in the ERP total without treating it as an index adjustment', () => {
    const enriched = withCalculatedFinance(
      snapshot,
      items([
        {
          ...raw,
          vlrCorrecaoAtra: 10.15,
          ValorReaj: 751.46,
        },
      ])
    );
    expect(enriched.calculated).toMatchObject({
      overduePrincipalCents: 72276,
      overdueTotalCents: 75146,
    });
  });
  it('rejects duplicate, missing, changed and unknown-component responses', () => {
    for (const response of [
      [],
      [...items(), ...items()],
      [{ ...items()[0], principalCents: 50000 }],
      [{ ...items()[0], correctionCents: null }],
      [{ ...items()[0], originalDueDate: '2026-11-11' }],
    ])
      expect(() => withCalculatedFinance(snapshot, response)).toThrow();
  });
  it('does not mix legacy base values with calculated totals or include paid debt', () => {
    const enriched = withCalculatedFinance(snapshot, items());
    expect(calculatedPortfolioTotals([enriched, snapshot])).toBeNull();
    expect(
      calculatedPortfolioTotals([{ ...enriched, referenceDate: '2026-11-28' }])
    ).toBeNull();
    const paid = withCalculatedFinance(
      { ...snapshot, positions: [], state: 'paid' },
      []
    );
    expect(calculatedPortfolioTotals([enriched, paid])).toEqual({
      overduePrincipalCents: 72276,
      overdueTotalCents: 74131,
      openTotalCents: 74131,
    });
  });
});
