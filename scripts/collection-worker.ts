import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
try {
  loadEnvFile('.env.local');
} catch {
  /* Containers supply their environment. */
}

async function main() {
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
  ])
    if (!process.env[key])
      throw new Error(`Variável obrigatória ausente: ${key}`);
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  if (process.argv.includes('--check')) {
    const { error } = await db
      .from('collection_portfolio_settings')
      .select('schedule_next_at')
      .limit(0);
    if (error)
      throw new Error('Agendamento indisponível. Confira a migration 110.');
    console.log(
      'Estrutura do agendamento validada. Nenhuma importação executada.'
    );
    return;
  }
  const { processCollectionScheduleTick } =
    await import('../src/lib/collections/schedule-worker');
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  console.log('Worker de sincronização UAU iniciado.');
  while (!stopping) {
    try {
      await processCollectionScheduleTick(db);
    } catch (error) {
      console.error(
        '[collection-schedule]',
        error instanceof Error ? error.message : 'Falha na sincronização.'
      );
    }
    for (let i = 0; i < 10 && !stopping; i++)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Falha ao iniciar worker.'
  );
  process.exitCode = 1;
});
