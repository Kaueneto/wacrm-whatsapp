import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  persistWebhookEnvelope,
  processQueuedWebhooks,
  splitWebhookEvents,
  webhookRetryDelay,
} from './webhook-queue';

const rpc = vi.fn();
const updates: Record<string, unknown>[] = [];
const db = {
  rpc,
  from: () => ({
    update: (patch: Record<string, unknown>) => {
      updates.push(patch);
      const result = Object.assign(Promise.resolve({ error: null }), {
        eq: () => result,
      });
      return result;
    },
  }),
} as unknown as SupabaseClient;
const job = {
  id: 'job',
  lease_token: 'token',
  account_id: 'account',
  payload: { entry: [] },
  attempts: 1,
  phase: 'ingest',
};
beforeEach(() => {
  rpc.mockReset();
  updates.length = 0;
});
describe('webhook queue', () => {
  it('does not let a failing delivery status block new customer messages', () => {
    const events = splitWebhookEvents({
      entry: [
        {
          id: 'waba',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '123' },
                messages: [{ id: 'inbound', from: 'customer' }],
                contacts: [{ wa_id: 'customer' }],
                statuses: [
                  {
                    id: 'outbound',
                    recipient_id: 'customer',
                    status: 'read',
                    timestamp: '1',
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[0].partition).not.toBe(events[1].partition);
  });
  it('splits batches and keeps deduplication keys stable', () => {
    const value = {
      metadata: { phone_number_id: '123' },
      messages: [
        { id: 'wamid1', from: 'a' },
        { id: 'wamid2', from: 'b' },
      ],
      contacts: [{ wa_id: 'a' }, { wa_id: 'b' }],
    };
    const events = splitWebhookEvents({
      entry: [{ id: 'waba', changes: [{ field: 'messages', value }] }],
    });
    expect(events).toHaveLength(2);
    expect(events[0].partition).not.toBe(events[1].partition);
    expect(events[1].payload.entry![0].changes[0].value.contacts).toEqual([
      { wa_id: 'b' },
    ]);
    expect(
      splitWebhookEvents({
        entry: [{ id: 'waba', changes: [{ field: 'messages', value }] }],
      }).map((e) => e.key)
    ).toEqual(events.map((e) => e.key));
  });
  it('refuses to acknowledge a receipt when the database cannot commit it', async () => {
    rpc.mockResolvedValue({ error: { message: 'database down' } });
    await expect(
      persistWebhookEnvelope(db, {
        entry: [
          {
            id: 'waba',
            changes: [
              { field: 'messages', value: { messages: [{ id: 'm' }] } },
            ],
          },
        ],
      })
    ).rejects.toThrow('persist');
  });
  it('settles a completed event only after its processor finishes', async () => {
    rpc
      .mockResolvedValueOnce({ data: [job], error: null })
      .mockResolvedValue({ data: [], error: null });
    const process = vi.fn(async () => {
      expect(updates).toEqual([]);
    });
    expect(await processQueuedWebhooks(db, process)).toEqual({
      done: 1,
      retried: 0,
      failed: 0,
    });
    expect(updates[0].state).toBe('done');
  });
  it('backs off storage failures instead of dropping the signed payload', async () => {
    rpc.mockResolvedValueOnce({ data: [job] }).mockResolvedValue({ data: [] });
    expect(
      await processQueuedWebhooks(db, async () => {
        throw new Error('storage unavailable');
      })
    ).toEqual({ done: 0, retried: 1, failed: 0 });
    expect(updates[0]).toMatchObject({
      state: 'pending',
      last_error: 'storage unavailable',
    });
    expect(webhookRetryDelay(1)).toBe(5);
    expect(webhookRetryDelay(20)).toBe(900);
  });
  it('flags ambiguous automation attempts for review instead of sending a duplicate response', async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ ...job, phase: 'effects_started' }] })
      .mockResolvedValue({ data: [] });
    const process = vi.fn();
    expect((await processQueuedWebhooks(db, process)).failed).toBe(1);
    expect(process).not.toHaveBeenCalled();
    expect(updates[0].state).toBe('needs_review');
  });
  it('requires review if an interruption occurs after the automation checkpoint', async () => {
    rpc
      .mockResolvedValueOnce({ data: [job] })
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValue({ data: [] });
    await processQueuedWebhooks(db, async (_payload, receipt) => {
      await receipt.beginEffects();
      throw new Error('interrupted');
    });
    expect(updates[0].state).toBe('needs_review');
  });
});
