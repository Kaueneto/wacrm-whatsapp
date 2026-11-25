import { describe, expect, it } from 'vitest';
import { normalizeAttendances } from './attendance-normalize';
import {
  uauRows,
  openInstallments,
  receivedInstallments,
} from './finance-normalize';
import { contactTimeline } from '@/lib/inbox/contact-timeline';
import type { ContactNote } from '@/types';
const schema = {
  Num_atd: 'System.Int32, mscorlib, Version=4.0.0.0',
  Descr_atd: 'System.String, mscorlib, Version=4.0.0.0',
};
const record = {
  Num_atd: 12,
  Descr_atd: 'Contato de teste.\r\n\r\nRetorno solicitado.',
  DataCad_atd: '2026-11-24T09:00:00',
  DataFim_atd: 'null',
  Status_atd: 0,
  Desc_cger: 'Financeiro',
  CodCateg_atd: 'FIN',
  UsrCad_atd: 'GABRIEL',
  UsrRespon_atd: 'ATENDENTE',
};
const contract = {
  key: '[1,"ABC",12]',
  company: 1,
  project: 'ABC',
  sale: 12,
  status: 0,
  units: [],
};
describe('UAU legacy tables and attendance timeline', () => {
  it('discards only the schema row while retaining actual MyTable records', () => {
    expect(uauRows([{ MyTable: [schema, record] }])).toEqual([record]);
    const [item] = normalizeAttendances([{ MyTable: [schema, record] }]);
    expect(item).toMatchObject({
      id: 12,
      category: 'Financeiro',
      closedAt: null,
      statusCode: 0,
      createdBy: 'GABRIEL',
      responsible: 'ATENDENTE',
      createdAt: '2026-11-24T09:00:00-03:00',
    });
    expect(item.description).not.toContain('System.');
  });
  it('does not display null sentinel users as names', () => {
    expect(
      normalizeAttendances([
        { ...record, UsrCad_atd: 'null', UsrRespon_atd: null },
      ])[0]
    ).toMatchObject({ createdBy: null, responsible: null });
  });
  it('accepts schema-only receipt responses as empty', () => {
    expect(
      receivedInstallments(
        [
          {
            Recebidas: [
              { Valor_Rec: 'System.Decimal, mscorlib, Version=4.0.0.0' },
            ],
          },
        ],
        contract
      )
    ).toEqual([]);
  });
  it('accepts the direct sales array returned by the installed ERP', () => {
    expect(
      openInstallments(
        [
          {
            Empresa: 1,
            Obra: 'ABC',
            Venda: 12,
            ParcelasVenda: [
              {
                NumParcela: 2,
                ValorParcela: 20,
                DataVencimento: '2026-11-23',
                TipoParcela: 'P',
              },
            ],
          },
        ],
        contract,
        '2026-11-24'
      )[0]
    ).toMatchObject({ number: '2', amountCents: 2000, daysOverdue: 1 });
  });
  it('keeps original due date and actual receipt date separate', () => {
    const [item] = receivedInstallments(
      [
        {
          Recebidas: [
            {
              Empresa_Rec: 1,
              Obra_Rec: 'ABC',
              NumVend_Rec: 12,
              NumParc_Rec: 2,
              Valor_Rec: 20,
              DataVenci_Rec: '2026-11-01',
              Data_Rec: '2026-11-24',
            },
          ],
        },
      ],
      contract
    );
    expect(item).toMatchObject({
      dueDate: '2026-11-01',
      paidDate: '2026-11-24',
    });
  });
  it('rejects malformed attendance records rather than showing an empty success', () => {
    expect(() =>
      normalizeAttendances([{ MyTable: [{ Num_atd: 12 }] }])
    ).toThrow();
  });
  it('merges chronologically with distinct source keys even when identifiers match', () => {
    const [attendance] = normalizeAttendances([{ MyTable: [record] }]);
    const note = {
      id: '12',
      created_at: '2026-11-24T13:00:00Z',
      note_text: 'Nota local',
    } as ContactNote;
    expect(
      contactTimeline([note], [attendance]).map((item) => [
        item.key,
        item.origin,
      ])
    ).toEqual([
      ['note:12', 'internal'],
      ['uau:12', 'uau'],
    ]);
  });
});
