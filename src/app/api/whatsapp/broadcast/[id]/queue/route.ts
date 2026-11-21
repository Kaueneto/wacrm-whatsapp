import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { fetchAllPages } from '@/lib/supabase/paged-query';
import { enqueueDefinition } from '@/lib/campaigns/prepare';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const { data, error } = await supabaseAdmin().rpc(
      'broadcast_queue_progress',
      { p_id: id, p_account: ctx.accountId }
    );
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return toErrorResponse(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const { action } = await request.json();
    const db = supabaseAdmin();
    if (['pause', 'resume', 'cancel'].includes(action)) {
      const { data, error } = await db.rpc('control_broadcast_job', {
        p_id: id,
        p_account: ctx.accountId,
        p_action: action,
      });
      if (error) throw error;
      return NextResponse.json({ success: data }, { status: data ? 200 : 404 });
    }
    if (!['retry', 'repeat'].includes(action))
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    const { data: job } = await db
      .from('broadcast_jobs')
      .select('*')
      .eq('broadcast_id', id)
      .eq('account_id', ctx.accountId)
      .single();
    const { data: source } = await ctx.supabase
      .from('broadcasts')
      .select('*')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .single();
    if (!job || !source)
      return NextResponse.json(
        { error: 'Disparo não encontrado.' },
        { status: 404 }
      );
    if (['queued', 'running', 'paused'].includes(job.state))
      return NextResponse.json(
        { error: 'Finalize ou cancele o disparo antes de criar outro.' },
        { status: 409 }
      );
    if (action === 'repeat') {
      const { data: campaign } = source.campaign_id
        ? await db
            .from('campaigns')
            .select('definition,name')
            .eq('id', source.campaign_id)
            .eq('account_id', ctx.accountId)
            .single()
        : { data: null };
      const definition = campaign?.definition ?? {
        templateId: job.template_snapshot.id,
        audience: source.audience_filter,
        variables: source.template_variables ?? {},
        headerMediaUrl: job.header_media_url,
      };
      const result = await enqueueDefinition(
        db,
        ctx.accountId,
        ctx.userId,
        campaign?.name ?? source.name,
        definition,
        source.campaign_id ?? undefined
      );
      return NextResponse.json(result, { status: 202 });
    }
    const rows = await fetchAllPages<{
      contact_id: string | null;
      phone_snapshot: string;
      name_snapshot: string;
      template_params: string[];
    }>((from, to) => {
      let query = db
        .from('broadcast_recipients')
        .select('contact_id,phone_snapshot,name_snapshot,template_params')
        .eq('broadcast_id', id)
        .neq('dispatch_state', 'unknown')
        .not('contact_id', 'is', null);
      if (action === 'retry') query = query.eq('status', 'failed');
      return query.order('id').range(from, to);
    });
    if (!rows.length)
      return NextResponse.json(
        {
          error:
            'Não há destinatários elegíveis para esse reenvio. Resultados incertos exigem conferência.',
        },
        { status: 400 }
      );
    const { data: newId, error } = await db.rpc('enqueue_broadcast', {
      p_account: ctx.accountId,
      p_user: ctx.userId,
      p_name: `${source.name} — ${action === 'retry' ? 'nova tentativa das falhas' : 'reenvio'}`,
      p_template: job.template_snapshot,
      p_phone: job.phone_number_id,
      p_waba: job.waba_id,
      p_media: job.header_media_url,
      p_campaign: source.campaign_id,
      p_parent: id,
      p_recipients: rows.map((r) => ({
        contact_id: r.contact_id,
        phone: r.phone_snapshot,
        name: r.name_snapshot,
        params: r.template_params,
      })),
      p_audience: source.audience_filter ?? {},
      p_variables: source.template_variables ?? {},
    });
    if (error)
      return NextResponse.json(
        {
          error:
            'Não foi possível criar outro disparo. Confira se a campanha já possui uma execução pendente.',
        },
        { status: 409 }
      );
    return NextResponse.json({ broadcastId: newId }, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
