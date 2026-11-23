import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('supervisor');
    const limit = checkRateLimit(
      `support-assign:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !body ||
      typeof body.conversationId !== 'string' ||
      !uuid.test(body.conversationId) ||
      ![body.teamId, body.agentId].every(
        (value) =>
          value === null || (typeof value === 'string' && uuid.test(value))
      )
    ) {
      return NextResponse.json(
        { error: 'Informe o atendimento, a equipe e o responsável.' },
        { status: 400 }
      );
    }
    // User-scoped client: RLS verifies the old AND destination scope; triggers
    // verify team membership, block attendants and record the change atomically.
    const { data, error } = await supabase
      .from('conversations')
      .update({ team_id: body.teamId, assigned_agent_id: body.agentId })
      .eq('id', body.conversationId)
      .eq('account_id', accountId)
      .select('id, team_id, assigned_agent_id')
      .maybeSingle();
    if (error?.code === '23514')
      return NextResponse.json({ error: error.message }, { status: 422 });
    if (error)
      return NextResponse.json(
        {
          error:
            'Não foi possível transferir. Confira sua permissão e a equipe do responsável.',
        },
        { status: 403 }
      );
    if (!data)
      return NextResponse.json(
        { error: 'Atendimento não encontrado ou fora dos departamentos que você supervisiona.' },
        { status: 404 }
      );
    return NextResponse.json({ conversation: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
