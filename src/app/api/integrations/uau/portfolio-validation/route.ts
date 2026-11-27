import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { parsePortfolioSetup } from '@/lib/collections/setup';
import {
  parsePilot,
  validatePortfolioQueries,
} from '@/lib/collections/query-validation';
import { UauError } from '@/lib/uau/client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const limit = checkRateLimit(`portfolio:validation:${accountId}`, {
      limit: 3,
      windowMs: 60000,
    });
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    let setup, pilot;
    try {
      setup = parsePortfolioSetup(body?.setup);
      pilot = body?.pilot === undefined ? undefined : parsePilot(body.pilot);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Confira os dados do teste.',
        },
        { status: 400 }
      );
    }
    return Response.json(
      await validatePortfolioQueries(accountId, setup, pilot),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof UauError)
      return Response.json(
        { error: error.message },
        {
          status: [400, 409, 422].includes(error.status) ? error.status : 502,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    return toErrorResponse(error);
  }
}
