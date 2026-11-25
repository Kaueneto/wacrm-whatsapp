import { supabaseAdmin } from '@/lib/ai/admin-client';
import { UauError } from './client';
import { normalizeUauLogin } from './user-login';

export async function loadAttendanceSettings(
  accountId: string,
  userId: string,
  revision: string
) {
  const { data, error } = await supabaseAdmin()
    .from('uau_attendance_user_settings')
    .select('uau_login')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .eq('connection_revision', revision)
    .maybeSingle();
  if (error)
    throw new UauError(
      'Não foi possível carregar as preferências UAU. Confira a migration 096.',
      503
    );
  return data ? { uau_login: normalizeUauLogin(data.uau_login) } : null;
}
