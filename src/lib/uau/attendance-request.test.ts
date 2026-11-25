import { describe, expect, it } from 'vitest';
import { attendanceRequest } from './attendance-request';
const input = {
  personId: 7,
  login: 'GABRIEL',
  category: '001',
  description: ' Cliente solicitou retorno. ',
  type: 1,
  contract: {
    key: '[1,"ABC",12]',
    company: 1,
    project: 'ABC',
    sale: 12,
    status: 0,
    units: ['Quadra 18 Lote 14'],
  },
};
describe('UAU creation payload', () => {
  it('normalizes even an older mixed-case stored login before sending to UAU', () => {
    expect(attendanceRequest({ ...input, login: '  Gabriel  ' })).toMatchObject(
      { usrrespon_atd: 'GABRIEL', usrcad_atd: 'GABRIEL' }
    );
  });
  it('omits an unselected type entirely and preserves an explicitly selected zero', () => {
    expect(attendanceRequest({ ...input, type: undefined })).not.toHaveProperty(
      'tipo_atd'
    );
    expect(attendanceRequest({ ...input, type: 0 })).toHaveProperty(
      'tipo_atd',
      0
    );
  });
  it('always uses the confirmed Telefone communication channel', () => {
    expect(attendanceRequest(input)).toHaveProperty('numccm_atd', 21);
  });
  it('sends customer return as an integer flag and recurrence as a boolean', () => {
    expect(
      attendanceRequest({ ...input, returnToCustomer: true, recurrent: true })
    ).toMatchObject({ retoraten_atd: 1, reincidente_atd: true });
    expect(attendanceRequest(input)).toMatchObject({
      retoraten_atd: 0,
      reincidente_atd: false,
    });
  });
  it('uses selected company/project, preserves the category and never infers a personalization from a unit label', () => {
    const result = attendanceRequest(input, new Date('2026-11-25T02:00:00Z'));
    expect(result).toMatchObject({
      codpes_atd: 7,
      codcateg_atd: '001',
      descr_atd: 'Cliente solicitou retorno.',
      usrrespon_atd: 'GABRIEL',
      usrcad_atd: 'GABRIEL',
      empresa_atd: 1,
      obra_atd: 'ABC',
      datacad_atd: '2026-11-24T23:00:00-03:00',
    });
    expect(result).not.toHaveProperty('numper_atd');
    expect(result).not.toHaveProperty('produnid_atd');
  });
  it('supports a person-only record and rejects unsupported type/empty description', () => {
    expect(attendanceRequest({ ...input, contract: null })).not.toHaveProperty(
      'empresa_atd'
    );
    expect(() => attendanceRequest({ ...input, type: 5 })).toThrow();
    expect(() => attendanceRequest({ ...input, description: '  ' })).toThrow();
  });
});
