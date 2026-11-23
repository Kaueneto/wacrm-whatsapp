import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';

try {
  loadEnvFile('.env.local');
} catch {
  /* Hosted workers use environment variables. */
}

async function main() {
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
  ]) {
    if (!process.env[name])
      throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  const { drainWebhookInbox } =
    await import('../src/lib/whatsapp/webhook-worker');
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  if (process.argv.includes('--check')) {
    const { error } = await db
      .from('whatsapp_webhook_events')
      .select('id')
      .limit(0);
    if (error) throw new Error('Fila de entrada indisponível.');
    console.log('Fila de entrada acessível. Nenhuma mensagem processada.');
    return;
  }
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  const id = `webhook-worker-${process.pid}`;
  let maintenanceAt = 0;
  console.log('Processador persistente de mensagens do WhatsApp iniciado.');
  while (!stopping) {
    try {
      if (Date.now() - maintenanceAt > 30000) {
        const { error } = await db
          .from('whatsapp_webhook_worker_heartbeats')
          .upsert({ id, seen_at: new Date().toISOString() });
        if (error) throw new Error('Falha no heartbeat do processador.');
        const cleanup = await db.rpc('cleanup_whatsapp_webhooks');
        if (cleanup.error) throw new Error('Falha na manutenção da fila.');
        maintenanceAt = Date.now();
      }
      const result = await drainWebhookInbox(db);
      if (result.done || result.retried || result.failed)
        console.log(JSON.stringify(result));
    } catch {
      console.error('Falha ao processar a fila; nova tentativa em seguida.');
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await db.from('whatsapp_webhook_worker_heartbeats').delete().eq('id', id);
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Falha ao iniciar o processador.'
  );
  process.exitCode = 1;
});
