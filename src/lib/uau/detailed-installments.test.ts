import { describe, expect, it } from 'vitest';
import {
  detailedOpenInstallments,
  receivedInstallments,
} from './finance-normalize';
const contract = {
  key: '[1,"ABC",12]',
  company: 1,
  project: 'ABC',
  sale: 12,
  status: 0,
  units: [],
};
const row = {
  Empresa_prc: 1,
  Obra_Prc: 'ABC',
  NumVend_prc: 12,
  NumParc_Prc: 2,
  NumParcGer_Prc: 8,
  Data_Prc: '2026-11-01T00:00:00',
  DataPror_Prc: '2026-11-20T00:00:00',
  Valor_Prc: 500,
  ValorReaj: 530.27,
  Tipo_Prc: 'E',
  Descricao_par: 'Entrada',
  IdxReaj_Prc: 'IGPM',
  vlrJurosParcela: 10,
  vlrCorrecao: 20.27,
  vlrJurosAtraso: 2,
  ValorMulta: 5,
  vlrDescAdiantamento: 0,
};
describe('detailed UAU receivables', () => {
  it('extracts only useful fields and keeps calculated amounts separate from charges', () => {
    const [item] = detailedOpenInstallments(
      [{ MyTable: [row] }],
      contract,
      '2026-11-24'
    );
    expect(item).toMatchObject({
      number: '2',
      description: 'Entrada',
      principalCents: 50000,
      amountCents: 53027,
      interestCents: 1000,
      correctionCents: 2027,
      lateInterestCents: 200,
      fineCents: 500,
      discountCents: 0,
      adjustmentIndex: 'IGPM',
      originalDueDate: '2026-11-01',
      extensionDate: '2026-11-20',
      dueDate: '2026-11-01',
      daysOverdue: 23,
    });
    expect(item).not.toHaveProperty('Empresa_prc');
  });
  it('accepts a serialized DataSet and filters technical schema rows', () => {
    const schema = Object.fromEntries(
      Object.keys(row).map((key) => [
        key,
        'System.String, mscorlib, Version=4.0.0.0',
      ])
    );
    expect(
      detailedOpenInstallments(
        JSON.stringify([{ MyTable: [schema, row] }]),
        contract,
        '2026-11-24'
      )
    ).toHaveLength(1);
    expect(
      detailedOpenInstallments([{ MyTable: [schema] }], contract, '2026-11-24')
    ).toEqual([]);
  });
  it.each([
    '2026-11-25T00:00:00',
    '2026-12-01T00:00:00',
    'null',
    'invalid',
    null,
    undefined,
  ])(
    'uses the original due date even when the extension is %s',
    (extension) => {
      const [item] = detailedOpenInstallments(
        [{ ...row, Data_Prc: '2026-11-18T00:00:00', DataPror_Prc: extension }],
        contract,
        '2026-11-25'
      );
      expect(item).toMatchObject({
        dueDate: '2026-11-18',
        originalDueDate: '2026-11-18',
        daysOverdue: 7,
      });
    }
  );
  it('sorts by original due date and distinguishes overdue, due today and future installments', () => {
    const items = detailedOpenInstallments(
      ['2026-11-26', '2026-11-18', '2026-11-25'].map((due, index) => ({
        ...row,
        NumParc_Prc: index + 1,
        Data_Prc: due,
        DataPror_Prc: '2026-12-01',
      })),
      contract,
      '2026-11-25'
    );
    expect(items.map((item) => [item.dueDate, item.daysOverdue])).toEqual([
      ['2026-11-18', 7],
      ['2026-11-25', 0],
      ['2026-11-26', 0],
    ]);
  });
  it('keeps absent component amounts unknown and actual zero amounts zero', () => {
    const [item] = detailedOpenInstallments(
      [
        {
          ...row,
          ValorMulta: null,
          vlrJurosAtraso: 'null',
          vlrCorrecao: undefined,
        },
      ],
      contract,
      '2026-11-24'
    );
    expect(item.fineCents).toBeNull();
    expect(item.lateInterestCents).toBeNull();
    expect(item.correctionCents).toBeNull();
    expect(item.discountCents).toBe(0);
  });
  it('rejects mismatched sales, missing calculated values and malformed amounts', () => {
    for (const change of [
      { Empresa_prc: 9 },
      { Obra_Prc: 'DEF' },
      { NumVend_prc: 13 },
      { ValorReaj: undefined },
      { ValorReaj: 'invalid' },
      { NumParc_Prc: '' },
      { Data_Prc: 'invalid' },
    ])
      expect(() =>
        detailedOpenInstallments(
          [{ ...row, ...change }],
          contract,
          '2026-11-24'
        )
      ).toThrow();
  });
});

it('keeps receipt principal separate from adjustments, interest, penalty and discount', () => {
  const [item] = receivedInstallments(
    [
      {
        Empresa_Rec: 1,
        Obra_Rec: 'ABC',
        NumVend_Rec: 12,
        NumParc_Rec: 2,
        Valor_Rec: 500,
        VlCorrecao_Rec: 10,
        VlJurosParc_Rec: 2,
        VlJuros_Rec: 3,
        VlMulta_Rec: 4,
        VlDesconto_Rec: 1,
        DataVenci_Rec: '2026-11-01',
        Data_Rec: '2026-11-24',
      },
    ],
    contract
  );
  expect(item).toMatchObject({
    amountCents: 50000,
    correctionCents: 1000,
    interestCents: 200,
    lateInterestCents: 300,
    fineCents: 400,
    discountCents: 100,
    paidDate: '2026-11-24',
  });
});
