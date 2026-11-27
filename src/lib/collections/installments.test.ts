import { describe, expect, it } from 'vitest';
import {
  installmentIdentity,
  installmentOverdue,
  withInstallmentMetadata,
} from './installments';
const position = {
  key: 'E_3_15',
  due: '2026-11-18',
  extension: '2026-12-20',
  cents: 66000,
  status: 0,
};
describe('readable installment details', () => {
  it('reads legacy compound identifiers as separate type and installment numbers', () => {
    expect(installmentIdentity(position)).toEqual({
      typeCode: 'E',
      typeName: null,
      number: '3',
      generalNumber: '15',
    });
  });
  it('uses the original maturity and positive balance to highlight overdue installments', () => {
    expect(installmentOverdue(position, '2026-11-27')).toBe(true);
    expect(installmentOverdue({ ...position, cents: 0 }, '2026-11-27')).toBe(
      false
    );
    expect(
      installmentOverdue({ ...position, due: '2026-11-27' }, '2026-11-27')
    ).toBe(false);
  });
  it('enriches a historical position with the actual UAU type without replacing amounts or dates', () => {
    const original = { key: '900_00001_1', positions: [position] };
    const enriched = withInstallmentMetadata(original, {
      key: original.key,
      positions: [
        {
          ...position,
          cents: 0,
          due: '2027-01-01',
          typeName: 'Entrada',
          typeCode: 'E',
          number: 3,
          generalNumber: 15,
        },
      ],
    });
    expect(enriched.positions[0]).toMatchObject({
      ...position,
      typeName: 'Entrada',
      number: 3,
      generalNumber: 15,
    });
    expect(original.positions[0]).not.toHaveProperty('typeName');
  });
  it('does not mix metadata from a different contract', () => {
    expect(() =>
      withInstallmentMetadata(
        { key: 'one', positions: [position] },
        { key: 'two', positions: [position] }
      )
    ).toThrow('outro contrato');
  });
});
