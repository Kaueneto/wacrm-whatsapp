import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { inspectWebhookConnection } from '@/lib/whatsapp/webhook-connection';

export async function GET() {
  try {
    const { accountId } = await requireRole('admin');
    const db = supabaseAdmin();
    const connectionPromise = inspectWebhookConnection(db, accountId);
    const states = ['pending', 'processing', 'failed', 'needs_review'] as const;
    const counts = await Promise.all(
      states.map((state) =>
        db
          .from('whatsapp_webhook_events')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', accountId)
          .eq('state', state)
      )
    );
    const [issues, heartbeat] = await Promise.all([
      db
        .from('whatsapp_webhook_events')
        .select('id,conversation_id,state,attempts,received_at')
        .eq('account_id', accountId)
        .in('state', ['failed', 'needs_review'])
        .order('received_at', { ascending: false })
        .limit(10),
      db
        .from('whatsapp_webhook_worker_heartbeats')
        .select('seen_at')
        .order('seen_at', { ascending: false })
        .limit(1),
    ]);
    if (
      counts.some((result) => result.error) ||
      issues.error ||
      heartbeat.error
    )
      throw new Error('Queue health unavailable');
    return Response.json({
      connection: await connectionPromise,
      counts: Object.fromEntries(
        states.map((state, index) => [state, counts[index].count || 0])
      ),
      issues: issues.data,
      worker_last_seen_at: heartbeat.data?.[0]?.seen_at ?? null,
      worker_online:
        !!heartbeat.data?.[0] &&
        Date.now() - new Date(heartbeat.data[0].seen_at).getTime() < 120000,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('admin');
    const body = await request.json().catch(() => null);
    if (body?.action !== 'retry_failed' && body?.action !== 'reviewed')
      return Response.json({ error: 'Ação inválida.' }, { status: 400 });
    if (
      typeof body.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.id
      )
    )
      return Response.json({ error: 'Evento inválido.' }, { status: 400 });
    const retry = body.action === 'retry_failed';
    const { data, error } = await supabaseAdmin()
      .from('whatsapp_webhook_events')
      .update(
        retry
          ? {
              state: 'pending',
              attempts: 0,
              available_at: new Date().toISOString(),
              last_error: null,
              lease_token: null,
              lease_until: null,
            }
          : { state: 'done', finished_at: new Date().toISOString() }
      )
      .eq('account_id', accountId)
      .eq('id', body.id)
      .eq('state', retry ? 'failed' : 'needs_review')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return Response.json(
        { error: 'Evento não encontrado ou já atualizado.' },
        { status: 404 }
      );
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
