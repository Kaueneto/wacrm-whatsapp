import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { parseUauConnection, UauError } from '@/lib/uau/client';
import {
  getUauConnectionSettings,
  saveUauConnection,
  testSavedUauConnection,
} from '@/lib/uau/connection-store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { accountId } = await requireRole('admin');
    return Response.json(
      { connection: await getUauConnectionSettings(accountId) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function changeConnection(request?: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const limit = checkRateLimit(`uau:connection:${accountId}`, {
      limit: 8,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);
    if (request) {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new UauError('Preencha os dados do UAU.', 400);
      await saveUauConnection(accountId, parseUauConnection(body));
    } else {
      await testSavedUauConnection(accountId);
    }
    return Response.json({ connected: true });
  } catch (error) {
    if (error instanceof UauError) {
      return Response.json(
        { error: error.message },
        {
          status:
            error.status === 409 || error.status === 400 ? error.status : 502,
        }
      );
    }
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  return changeConnection(request);
}
export async function POST() {
  return changeConnection();
}
