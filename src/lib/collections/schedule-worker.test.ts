import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPortfolioSetup } from './setup';
const sync = vi.hoisted(() => ({ begin: vi.fn(), execute: vi.fn() }));
vi.mock('./sync', () => ({
  beginPortfolioSync: sync.begin,
  executePortfolioSync: sync.execute,
}));
import { processCollectionScheduleTick } from './schedule-worker';

function database(claimed = true) {
  const setup = defaultPortfolioSetup();
  setup.schedule.enabled = true;
  setup.queries.open.id = 144;
  setup.queries.reconciliation.id = 145;
  const eq = vi.fn();
  const query = {
    eq,
    then: (resolve: (value: { error: null }) => unknown) =>
      Promise.resolve({ error: null }).then(resolve),
  };
  eq.mockReturnValue(query);
  const update = vi.fn().mockReturnValue(query);
  const db = {
    rpc: vi
      .fn()
      .mockResolvedValue({
        data: claimed
          ? [
              {
                account_id: 'account',
                updated_by: 'admin',
                updated_at: '2026-11-27T11:00:00Z',
                schedule_lease: 'lease',
                setup,
              },
            ]
          : [],
        error: null,
      }),
    from: vi.fn().mockReturnValue({ update }),
  };
  return { db, update, eq };
}
beforeEach(() => {
  vi.clearAllMocks();
  sync.begin.mockResolvedValue({ run: 'job' });
  sync.execute.mockResolvedValue(1);
});
describe('collection schedule worker', () => {
  it('does no work when nothing is due', async () => {
    const { db, update } = database(false);
    expect(
      await processCollectionScheduleTick(db as unknown as SupabaseClient)
    ).toBe(false);
    expect(sync.begin).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('imports the claimed organization and protects updates with settings revision and lease', async () => {
    const { db, update, eq } = database();
    expect(
      await processCollectionScheduleTick(db as unknown as SupabaseClient)
    ).toBe(true);
    expect(sync.begin).toHaveBeenCalledWith(
      'account',
      'admin',
      '2026-11-27T11:00:00Z'
    );
    expect(sync.execute).toHaveBeenCalledWith({ run: 'job' });
    expect(eq).toHaveBeenCalledWith('updated_at', '2026-11-27T11:00:00Z');
    expect(eq).toHaveBeenCalledWith('schedule_lease', 'lease');
    expect(
      Date.parse(update.mock.calls[0][0].schedule_next_at)
    ).toBeGreaterThan(Date.now());
    expect(update).toHaveBeenLastCalledWith({
      schedule_lease: null,
      schedule_lease_until: null,
    });
  });
  it('records failures, backs off and releases the claim', async () => {
    sync.begin.mockRejectedValueOnce(Error('Conexão indisponível'));
    const { db, update } = database();
    await expect(
      processCollectionScheduleTick(db as unknown as SupabaseClient)
    ).rejects.toThrow('Conexão indisponível');
    expect(sync.execute).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].schedule_error).toBe('Conexão indisponível');
    expect(
      Date.parse(update.mock.calls[0][0].schedule_next_at) - Date.now()
    ).toBeGreaterThan(290_000);
    expect(update).toHaveBeenLastCalledWith({
      schedule_lease: null,
      schedule_lease_until: null,
    });
  });
  it('does not issue UAU queries if claiming the schedule fails', async () => {
    const { db } = database();
    db.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'unavailable' },
    });
    await expect(
      processCollectionScheduleTick(db as unknown as SupabaseClient)
    ).rejects.toThrow('migration 110');
    expect(sync.begin).not.toHaveBeenCalled();
  });
});
