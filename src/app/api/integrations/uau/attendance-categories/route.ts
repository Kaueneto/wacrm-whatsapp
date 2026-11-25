import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { withUauReadSession } from '@/lib/uau/connection-store';
import { attendanceCategories } from '@/lib/uau/attendance-categories';
import { UauError } from '@/lib/uau/client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET() {
  try {
    const auth = await requireRole('agent');
    const limit = checkRateLimit(
      `uau:categories:${auth.accountId}:${auth.userId}`,
      { limit: 20, windowMs: 60_000 }
    );
    if (!limit.success) return rateLimitResponse(limit);
    return Response.json(
      await withUauReadSession(auth.accountId, async (read) =>
        attendanceCategories(
          await read('Atendimento/ConsultarCategDeComentAtivas', {}),
          { requireWorkflow: true }
        )
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return error instanceof UauError
      ? Response.json(
          { error: error.message },
          { status: error.status >= 500 ? 502 : error.status }
        )
      : toErrorResponse(error);
  }
}
