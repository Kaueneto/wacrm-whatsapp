import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { parsePortfolioSetup } from '@/lib/collections/setup';
import { nextPortfolioSync } from '@/lib/collections/schedule';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const headers = { 'Cache-Control': 'no-store' };
const storageError = (code: string | undefined) =>
  Response.json(
    {
      error: ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code ?? '')
        ? 'A configuração da carteira ainda não está disponível no banco. Confira as migrations 106 e 110.'
        : 'Não foi possível acessar a configuração da carteira. Tente novamente.',
    },
    { status: 503, headers }
  );

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const { data, error } = await supabase
      .from('collection_portfolio_settings')
      .select('setup,updated_at,status')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) return storageError(error.code);
    return Response.json({ settings: data }, { headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(`portfolio:settings:${accountId}`, {
      limit: 20,
      windowMs: 60000,
    });
    if (!limit.success) return rateLimitResponse(limit);
    let setup;
    try {
      setup = parsePortfolioSetup(await request.json());
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : 'Configuração inválida.',
        },
        { status: 400, headers }
      );
    }
    const { error } = await supabase
      .from('collection_portfolio_settings')
      .upsert({
        account_id: accountId,
        setup,
        ...(setup.schedule.enabled
          ? { schedule_next_at: nextPortfolioSync(setup), schedule_error: null }
          : {}),
        status: 'draft',
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });
    if (error) return storageError(error.code);
    return Response.json({ saved: true, status: 'draft' }, { headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
