import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { withUauReadSession } from '@/lib/uau/connection-store';
import { UauError } from '@/lib/uau/client';
import { normalizeQueryParameters } from '@/lib/uau/query-parameters-normalize';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const limit = checkRateLimit('uau:parameters:' + accountId, {
      limit: 20,
      windowMs: 60000,
    });
    if (!limit.success) return rateLimitResponse(limit);
    const input = await request.json().catch(() => null);
    if (
      !input ||
      !Number.isSafeInteger(input.id) ||
      input.id < 1 ||
      ![0, 1].includes(input.custom)
    )
      throw new UauError(
        'Informe um código de consulta válido e escolha o tipo.',
        400
      );
    const parameters = await withUauReadSession(accountId, async (read) =>
      normalizeQueryParameters(
        await read('RotinasGerais/ConsultarParamConsultaGeral', {
          Id: input.id,
          Personalizado: input.custom,
        })
      )
    );
    return Response.json(
      { parameters },
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
