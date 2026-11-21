import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { nextOccurrence } from '@/lib/campaigns/schedule';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const body = await request.json();
    if (typeof body.active !== 'boolean')
      return NextResponse.json(
        { error: 'Informe se a programação está ativa.' },
        { status: 400 }
      );
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
    const next = body.active
      ? nextOccurrence(c.schedule, new Date())
      : c.next_run_at;
    if (body.active && !next)
      return NextResponse.json(
        {
          error:
            'A data dessa programação já passou. Crie uma nova programação.',
        },
        { status: 400 }
      );
    const { error } = await supabaseAdmin()
      .from('campaigns')
      .update({
        active: body.active,
        next_run_at: next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('account_id', ctx.accountId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
