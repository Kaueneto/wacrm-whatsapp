import type { SupabaseClient } from '@supabase/supabase-js';
import type { UauFinance } from './finance-types';
import { supabaseAdmin } from '@/lib/ai/admin-client';

/** Only resolve users in this account and connection. Preserve ERP logins when no mapping exists. */
export async function attendanceUserNames(
  accountId: string,
  revision: string,
  finance: UauFinance,
  client?: SupabaseClient
): Promise<UauFinance> {
  if (!finance.attendances?.length) return finance;
  const db = client ?? supabaseAdmin();
  const { data: mappings, error } = await db
    .from('uau_attendance_user_settings')
    .select('user_id,uau_login')
    .eq('account_id', accountId)
    .eq('connection_revision', revision);
  // Older installs without migration 096 must still display existing ERP history.
  if (error || !mappings?.length) return finance;
  const { data: profiles, error: profileError } = await db
    .from('profiles')
    .select('user_id,full_name')
    .eq('account_id', accountId)
    .in(
      'user_id',
      mappings.map((row) => row.user_id)
    );
  if (profileError || !profiles) return finance;
  const names = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const name = profiles
      .find((profile) => profile.user_id === mapping.user_id)
      ?.full_name?.trim();
    if (!name) continue;
    const key = mapping.uau_login.toLowerCase();
    const candidates = names.get(key) ?? new Set<string>();
    candidates.add(name);
    names.set(key, candidates);
  }
  const resolve = (login: string | null | undefined) => {
    const candidates = login ? names.get(login.toLowerCase()) : null;
    return candidates?.size === 1 ? [...candidates][0] : null;
  };
  return {
    ...finance,
    attendances: finance.attendances.map((item) => ({
      ...item,
      createdByName: resolve(item.createdBy),
      responsibleName: resolve(item.responsible),
    })),
  };
}
