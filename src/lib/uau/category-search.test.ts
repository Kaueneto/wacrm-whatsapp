import { expect, it } from 'vitest';
import { matchesAttendanceCategory } from './category-search';
const item = { code: '001.02', name: 'Retenção — Cobrança', parentCode: null, workflowLink: null };
it('matches codes, accent-insensitive text and combinations without changing the stored code', () => {
  for (const query of ['001', '001.02', 'retencao', 'COBRANCA', '001 cobranca', '  '])
    expect(matchesAttendanceCategory(item, query)).toBe(true);
  expect(matchesAttendanceCategory(item, 'juridico')).toBe(false);
  expect(matchesAttendanceCategory(item, '001 vendas')).toBe(false);
  expect(item.code).toBe('001.02');
});
