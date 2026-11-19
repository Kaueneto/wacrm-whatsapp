import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { resolveTemplateRow } from '@/lib/whatsapp/template-body';
import { POST as control } from '../queue/route';

// Backwards-compatible recovery entry point; no work runs in after().
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const { data: source } = await ctx.supabase
      .from('broadcasts')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single();
    if (!source)
      return NextResponse.json(
        { error: 'Disparo não encontrado.' },
        { status: 404 }
      );
    if (body.scope === 'failed')
      return control(
        new Request(request.url, {
          method: 'POST',
          body: JSON.stringify({ action: 'retry' }),
        }),
        context
      );
    const db = supabaseAdmin();
    const { data: job } = await db
      .from('broadcast_jobs')
      .select('state')
      .eq('broadcast_id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!job) {
      const { data: config } = await db
        .from('whatsapp_config')
        .select('phone_number_id,waba_id')
        .eq('account_id', ctx.accountId)
        .single();
      if (!config)
        return NextResponse.json(
          { error: 'Configure o WhatsApp.' },
          { status: 400 }
        );
      const template = await resolveTemplateRow(
        db,
        ctx.accountId,
        source.template_name,
        source.template_language
      );
      const { error } = await db.rpc('adopt_broadcast_queue', {
        p_id: id,
        p_account: ctx.accountId,
        p_template: template.row ?? {
          name: source.template_name,
          language: source.template_language,
        },
        p_phone: config.phone_number_id,
        p_waba: config.waba_id,
      });
      if (error) throw error;
    } else {
      const { error } = await db.rpc('control_broadcast_job', {
        p_id: id,
        p_account: ctx.accountId,
        p_action: 'resume',
      });
      if (error) throw error;
    }
    const { count } = await ctx.supabase
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', id)
      .eq('status', 'pending');
    return NextResponse.json(
      { success: true, broadcast_id: id, resuming: count ?? 0, remaining: 0 },
      { status: 202 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
