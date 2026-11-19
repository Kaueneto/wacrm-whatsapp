import { NextResponse } from 'next/server';
import {
  requireRole,
  toErrorResponse,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { enqueueDefinition } from '@/lib/campaigns/prepare';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `broadcast-enqueue:${ctx.userId}`,
      RATE_LIMITS.broadcast
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json();
    if (typeof body.name !== 'string')
      throw new Error('Informe o nome do disparo.');
    const result = await enqueueDefinition(
      supabaseAdmin(),
      ctx.accountId,
      ctx.userId,
      body.name,
      body.definition,
      undefined,
      undefined,
      body.requestKey
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
      return toErrorResponse(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível enfileirar.',
      },
      { status: 400 }
    );
  }
}
