import { timingSafeEqual } from 'node:crypto';
import { drainWebhookInbox } from '@/lib/whatsapp/webhook-worker';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const maxDuration = 60;
export async function POST(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected)
    return Response.json(
      { error: 'Processamento agendado não configurado.' },
      { status: 503 }
    );
  const actual = request.headers.get('x-cron-secret') || '';
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await drainWebhookInbox();
    const { error } = await supabaseAdmin()
      .from('whatsapp_webhook_worker_heartbeats')
      .upsert({ id: 'webhook-cron', seen_at: new Date().toISOString() });
    if (error) throw error;
    await supabaseAdmin().rpc('cleanup_whatsapp_webhooks');
    return Response.json(result);
  } catch {
    return Response.json(
      { error: 'Falha ao processar a fila.' },
      { status: 503 }
    );
  }
}
