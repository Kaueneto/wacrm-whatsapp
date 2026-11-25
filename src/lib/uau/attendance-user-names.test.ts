import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UauFinance } from './finance-types';
import { attendanceUserNames } from './attendance-user-names';
it('resolves only unambiguous current-account users and preserves unmatched ERP logins', async () => {
  const eq = vi.fn(); const chain = { select: () => chain, eq, in: async () => ({ data: [{ user_id: 'a', full_name: 'Gabriel' }, { user_id: 'b', full_name: 'Outro' }] }), then: (resolve: (value: unknown) => void) => resolve({ data: [{ user_id: 'a', uau_login: 'GABRIEL' }, { user_id: 'a', uau_login: 'DUPLICADO' }, { user_id: 'b', uau_login: 'DUPLICADO' }] }) };
  eq.mockReturnValue(chain);
  const db = { from: () => chain } as unknown as SupabaseClient;
  const finance = { attendances: [{ id: 1, createdBy: 'gabriel', responsible: 'DUPLICADO' }, { id: 2, createdBy: 'LEGADO' }] } as UauFinance;
  const result = await attendanceUserNames('account', 'revision', finance, db);
  expect(eq).toHaveBeenCalledWith('account_id', 'account'); expect(eq).toHaveBeenCalledWith('connection_revision', 'revision');
  expect(result.attendances?.[0]).toMatchObject({ createdByName: 'Gabriel', responsibleName: null, responsible: 'DUPLICADO' });
  expect(result.attendances?.[1]).toMatchObject({ createdByName: null, createdBy: 'LEGADO' });
});
