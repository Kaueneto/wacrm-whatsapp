import { NextResponse } from 'next/server';
import {
  requireRole,
  toErrorResponse,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { validateDefinition } from '@/lib/campaigns/definition';
import { nextOccurrence, validateSchedule } from '@/lib/campaigns/schedule';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const { data, error } = await ctx.supabase
      .from('campaigns')
      .select('id,name,description,active,next_run_at,last_error,schedule')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });
    if (error)
      return NextResponse.json(
        { error: 'Não foi possível carregar as campanhas.' },
        { status: 500 }
      );
    return NextResponse.json({ campaigns: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = await request.json();
    if (typeof body.name !== 'string' || !body.name.trim())
      throw new Error('Informe o título da campanha.');
    validateDefinition(body.definition);
    validateSchedule(body.schedule);
    const next = nextOccurrence(body.schedule, new Date());
    if (body.active && !next)
      throw new Error('Escolha uma data futura para programar a execução.');
    const { data, error } = await supabaseAdmin()
      .from('campaigns')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: body.name.trim(),
        description:
          typeof body.description === 'string' ? body.description : '',
        definition: body.definition,
        schedule: body.schedule,
        active: body.active === true,
        next_run_at: next,
      })
      .select('id')
      .single();
    if (error)
      return NextResponse.json(
        { error: 'Não foi possível salvar a campanha.' },
        { status: 500 }
      );
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
      return toErrorResponse(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Dados inválidos.' },
      { status: 400 }
    );
  }
}
