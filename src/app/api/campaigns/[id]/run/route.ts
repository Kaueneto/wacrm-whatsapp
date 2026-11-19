import { NextResponse } from 'next/server';
import {
  requireRole,
  toErrorResponse,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { enqueueDefinition } from '@/lib/campaigns/prepare';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await params;
    const { data: c } = await ctx.supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single();
    if (!c)
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    const result = await enqueueDefinition(
      supabaseAdmin(),
      ctx.accountId,
      ctx.userId,
      c.name,
      c.definition,
      c.id
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
      return toErrorResponse(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Não foi possível iniciar.',
      },
      { status: 400 }
    );
  }
}
