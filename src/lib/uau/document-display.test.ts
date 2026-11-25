import { expect, it } from 'vitest';
import { formatUauDocument } from './document-display';

it('formats CPF and CNPJ while preserving hidden digits and unknown values', () => {
  expect(formatUauDocument('***.***.247-25')).toBe('***.***.247-25');
  expect(formatUauDocument('12345678901')).toBe('123.456.789-01');
  expect(formatUauDocument('12345678000190')).toBe('12.345.678/0001-90');
  expect(formatUauDocument('********000190')).toBe('**.***.***/0001-90');
  expect(formatUauDocument('')).toBe('');
});
