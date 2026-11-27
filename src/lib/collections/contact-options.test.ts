import { describe, expect, it } from 'vitest';
import {
  formatCollectionPhone,
  reconcileContactOptions,
  type CollectionContactOption,
} from './contact-options';
const option = (
  patch: Partial<CollectionContactOption>
): CollectionContactOption => ({
  id: 'uau',
  phone: '(62) 99999-1234',
  dialable: '5562999991234',
  source: 'UAU',
  primary: true,
  note: null,
  ...patch,
});
describe('readable portfolio phone choices', () => {
  it('formats Brazilian numbers without changing or inventing digits', () => {
    expect(formatCollectionPhone('5562985585138')).toBe('(62) 98558-5138');
    expect(formatCollectionPhone('(62) 999991234')).toBe('(62) 99999-1234');
    expect(formatCollectionPhone('556293748947')).toBe('(62) 9374-8947');
    expect(formatCollectionPhone('556233331234')).toBe('(62) 3333-1234');
    expect(formatCollectionPhone('+1 415 555 1234')).toBe('+1 415 555 1234');
    expect(formatCollectionPhone('14155551234', true)).toBe('14155551234');
    expect(formatCollectionPhone('9999-1234')).toBe('9999-1234');
  });
  it('merges exact matches while keeping unrelated CRM links separate', () => {
    const result = reconcileContactOptions([
      option({ id: 'crm-same', source: 'CRM', contactId: 'contact-a' }),
      option({
        id: 'crm-other',
        source: 'CRM',
        dialable: '5562985585138',
        phone: '5562985585138',
      }),
      option({}),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'uau',
      source: 'UAU + CRM',
      contactId: 'contact-a',
      primary: true,
    });
    expect(result[1]).toMatchObject({ id: 'crm-other', source: 'CRM' });
  });
  it('does not treat a person/CPF link or an eight-digit variant as a verified UAU telephone match', () => {
    const result = reconcileContactOptions([
      option({ id: 'crm', source: 'CRM', dialable: '556293748947' }),
      option({ dialable: '5562993748947' }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.source)).toEqual(['UAU', 'CRM']);
  });
  it('deduplicates repeated UAU numbers and preserves the primary marker', () => {
    const result = reconcileContactOptions([
      option({ primary: false }),
      option({ id: 'uau-2' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].primary).toBe(true);
  });
});
