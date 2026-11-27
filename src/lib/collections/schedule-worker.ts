import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePortfolioSetup } from './setup';
import { nextPortfolioSync } from './schedule';
import { beginPortfolioSync, executePortfolioSync } from './sync';

interface ClaimedSchedule {
  account_id: string;
  setup: unknown;
  updated_by: string;
  updated_at: string;
  schedule_lease: string;
}

export async function processCollectionScheduleTick(
  db: SupabaseClient
): Promise<boolean> {
  const { data, error } = await db.rpc('claim_collection_schedule');
  if (error)
    throw new Error(
      'Não foi possível consultar o agendamento. Confira a migration 110.'
    );
  const claimed = (data as ClaimedSchedule[] | null)?.[0];
  if (!claimed) return false;
  let failure: string | null = null;
  let next: string | null = null;
  try {
    const setup = parsePortfolioSetup(claimed.setup);
    if (setup.schedule.enabled) {
      const job = await beginPortfolioSync(
        claimed.account_id,
        claimed.updated_by,
        claimed.updated_at
      );
      await executePortfolioSync(job);
      next = nextPortfolioSync(setup);
    }
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message
        : 'Falha na sincronização agendada.';
    next = new Date(Date.now() + 5 * 60_000).toISOString();
  }
  try {
    // A settings save owns its new next date. An older worker must not overwrite it.
    const result = await db
      .from('collection_portfolio_settings')
      .update({ schedule_next_at: next, schedule_error: failure })
      .eq('account_id', claimed.account_id)
      .eq('updated_at', claimed.updated_at)
      .eq('schedule_lease', claimed.schedule_lease);
    if (result.error)
      throw new Error('Falha ao atualizar a próxima sincronização.');
  } finally {
    const released = await db
      .from('collection_portfolio_settings')
      .update({ schedule_lease: null, schedule_lease_until: null })
      .eq('account_id', claimed.account_id)
      .eq('schedule_lease', claimed.schedule_lease);
    if (released.error)
      throw new Error('Falha ao liberar o agendamento da sincronização.');
  }
  if (failure) throw new Error(failure);
  return true;
}
