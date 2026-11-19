import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';

try {
  loadEnvFile('.env.local');
} catch {
  /* Containers use their environment. */
}

async function main() {
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
  ]) {
    if (!process.env[key])
      throw new Error(`Variável obrigatória ausente: ${key}`);
  }
  const { processQueueTick, processScheduleTick } =
    await import('../src/lib/campaigns/worker');
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const id = `worker-${process.pid}`;
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  if (process.argv.includes('--check')) {
    const { error } = await db
      .from('broadcast_jobs')
      .select('broadcast_id')
      .limit(0);
    if (error) throw new Error(`Fila indisponível: ${error.message}`);
    console.log('Conexão com a fila validada. Nenhum envio executado.');
    return;
  }
  console.log(
    'Worker de campanhas iniciado. Ctrl+C encerra após o item em andamento.'
  );
  let lastMaintenance = 0;
  async function deliveryLoop() {
    while (!stopping) {
      try {
        if (Date.now() - lastMaintenance > 30000) {
          const { error } = await db
            .from('campaign_worker_heartbeats')
            .upsert({ id, seen_at: new Date().toISOString() });
          if (error) throw new Error('Falha no heartbeat do worker.');
          // Status replay buffer has bounded retention. Events already applied
          // remain on recipients; this only expires the race-recovery buffer.
          const { error: cleanupError } = await db
            .from('broadcast_status_events')
            .delete()
            .lt(
              'received_at',
              new Date(Date.now() - 7 * 86400000).toISOString()
            );
          if (cleanupError) throw new Error('Falha na manutenção dos eventos.');
          lastMaintenance = Date.now();
        }
        const worked = await processQueueTick(db);
        await new Promise((resolve) =>
          setTimeout(resolve, worked ? 100 : 1000)
        );
      } catch (error) {
        console.error(
          '[worker]',
          error instanceof Error ? error.message : 'Falha de processamento'
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
  async function schedulerLoop() {
    while (!stopping) {
      try {
        await processScheduleTick(db);
      } catch (error) {
        console.error(
          '[scheduler]',
          error instanceof Error ? error.message : 'Falha na programação'
        );
      }
      for (let i = 0; i < 10 && !stopping; i++)
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  await Promise.all([deliveryLoop(), schedulerLoop()]);
  console.log('Worker encerrado. Itens pendentes permanecem no banco.');
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Falha ao iniciar worker'
  );
  process.exitCode = 1;
});
