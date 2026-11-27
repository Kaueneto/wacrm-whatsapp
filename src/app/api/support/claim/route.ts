import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole('agent');
    const limit = checkRateLimit(`support-claim:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    if (typeof body?.conversationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.conversationId)) {
      return NextResponse.json({ error: 'Informe um atendimento válido.' }, { status: 400 });
    }
    const { data, error } = await supabase.rpc('claim_team_conversation', {
      p_conversation_id: body.conversationId,
    });
    if (error) return NextResponse.json({
      error: error.code === 'P0001' ? 'Este atendimento já foi assumido ou encerrado.' : 'Não foi possível assumir este atendimento da sua equipe.',
    }, { status: error.code === 'P0001' ? 409 : 403 });
    return NextResponse.json({ conversationId: body.conversationId, assignedAgentId: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
