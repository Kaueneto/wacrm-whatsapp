import { describe, expect, it } from 'vitest';
import {
  attendanceResponseId,
  attendanceResponseOutcome,
  matchingNewAttendance,
} from './attendance-confirmation';
import { attendanceRequest } from './attendance-request';
import type { UauAttendance } from './finance-types';

const time = '2026-11-25T12:00:00Z';
const payload = attendanceRequest(
  {
    personId: 7,
    login: 'gabriel',
    category: '001',
    description: 'Cliente solicitou retorno.',
    contract: null,
  },
  new Date(time)
);
const record: UauAttendance = {
  id: 88,
  categoryCode: '001',
  category: 'Financeiro',
  description: 'Cliente solicitou retorno.',
  createdBy: 'GABRIEL',
  createdAt: time,
  closedAt: null,
  statusCode: 0,
};
describe('attendance success confirmation', () => {
  it('recognizes documented empty success, true and explicit success flags without treating description as failure', () => {
    for (const value of [
      {},
      true,
      { Sucesso: true, Descricao: 'Gravado' },
      { _Sucesso: true },
    ])
      expect(attendanceResponseOutcome(value)).toBe('success');
    for (const value of [
      false,
      { Sucesso: false },
      { _Sucesso: false },
      { Sucesso: true, _ListaErros: ['Falha'] },
    ])
      expect(attendanceResponseOutcome(value)).toBe('rejected');
  });
  it('recognizes the returned attendance number directly, including text and Num_atd DTOs', () => {
    for (const value of [
      88,
      '88',
      ' 88 ',
      { Num_atd: 88 },
      { num_atd: '88' },
    ]) {
      expect(attendanceResponseId(value)).toBe(88);
      expect(attendanceResponseOutcome(value)).toBe('success');
    }
    for (const value of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      2147483648,
      '',
      'erro 88',
      true,
      null,
      { Num_atd: 88, Sucesso: false },
    ])
      expect(attendanceResponseId(value)).toBeNull();
  });
  it('requires read confirmation for text, void, arrays and unfamiliar DTOs', () => {
    for (const value of [
      '',
      null,
      [{ Num_atd: 88 }],
      { Mensagem: 'Registrado' },
    ])
      expect(attendanceResponseOutcome(value)).toBe('unknown');
  });
  it('confirms only a uniquely matching new record, never a prior record or another category/user', () => {
    expect(matchingNewAttendance([], payload, [record])?.id).toBe(88);
    expect(matchingNewAttendance([88], payload, [record])).toBeNull();
    expect(
      matchingNewAttendance([], payload, [record, { ...record, id: 89 }])
    ).toBeNull();
    for (const other of [
      { ...record, categoryCode: '002' },
      { ...record, createdBy: 'OUTRO' },
      { ...record, createdBy: null },
      { ...record, description: 'Outro assunto' },
      { ...record, createdAt: '2026-11-24T12:00:00Z' },
    ])
      expect(matchingNewAttendance([], payload, [other])).toBeNull();
  });
});
