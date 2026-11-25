import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/ai/admin-client';
import { getUauConnectionRevision } from '@/lib/uau/connection-store';
import { loadAttendanceSettings } from '@/lib/uau/attendance-settings';
import { UauError } from '@/lib/uau/client';
import { normalizeUauLogin } from '@/lib/uau/user-login';

function failed(error: unknown) {
  return error instanceof UauError
    ? Response.json({ error: error.message }, { status: error.status })
    : toErrorResponse(error);
}
export async function GET() {
  try {
    const auth = await requireRole('agent');
    const revision = await getUauConnectionRevision(auth.accountId);
    return Response.json(
      revision
        ? await loadAttendanceSettings(auth.accountId, auth.userId, revision)
        : null,
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return failed(error);
  }
}
export async function PUT(request: Request) {
  try {
    const auth = await requireRole('agent');
    const body = await request.json().catch(() => null);
    const login =
      typeof body?.login === 'string' ? normalizeUauLogin(body.login) : '';
    if (!login || login.length > 256 || /[\x00-\x1f\x7f]/.test(login))
      throw new UauError('Informe seu login UAU.', 400);
    const revision = await getUauConnectionRevision(auth.accountId);
    if (!revision)
      throw new UauError('Cadastre a integração UAU primeiro.', 409);
    const { error } = await supabaseAdmin()
      .from('uau_attendance_user_settings')
      .upsert({
        account_id: auth.accountId,
        user_id: auth.userId,
        connection_revision: revision,
        uau_login: login,
      });
    if (error)
      throw new UauError(
        'Não foi possível salvar as preferências UAU. Confira a migration 096.',
        503
      );
    return Response.json({ saved: true });
  } catch (error) {
    return failed(error);
  }
}
