import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/whatsapp/encryption';
import {
  classifyMetaResponse,
  processQueueTick,
  retrySeconds,
  sendQueueItem,
  type QueueItem,
} from './worker';

const item: QueueItem = {
  lease: 'lease',
  recipient: {
    id: 'recipient',
    phone_snapshot: '5562111111111',
    template_params: [],
    attempt_count: 0,
  },
  job: {
    broadcast_id: 'broadcast',
    account_id: 'account',
    phone_number_id: 'phone',
    waba_id: 'waba',
    template_snapshot: {
      name: 'test',
      language: 'pt_BR',
      body_text: 'Teste',
    } as QueueItem['job']['template_snapshot'],
  },
};
function database(phone = 'phone') {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({
        data: {
          access_token: encrypt('test-token'),
          phone_number_id: phone,
          waba_id: 'waba',
        },
      }),
  };
  return { from: vi.fn(() => query) } as unknown as SupabaseClient;
}
describe('Durable campaign delivery', () => {
  it('retries explicit throttling with bounded backoff and dead-letters after five attempts', () => {
    expect(classifyMetaResponse(429, 130429, 1)).toBe('queued');
    expect(classifyMetaResponse(400, 131056, 4)).toBe('queued');
    expect(classifyMetaResponse(429, 130429, 5)).toBe('failed');
    expect(retrySeconds(1, '120')).toBe(120);
    expect(retrySeconds(20)).toBeLessThanOrEqual(3600);
    expect(classifyMetaResponse(400, 131042, 1)).toBe('failed');
    expect(classifyMetaResponse(503, undefined, 1)).toBe('unknown');
  });
  it('never retries an ambiguous network failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('network'));
    expect((await sendQueueItem(database(), item, fetcher)).outcome).toBe(
      'unknown'
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('persists API acceptance separately from delivery', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: 'wamid-test' }] }))
      );
    expect(await sendQueueItem(database(), item, fetcher)).toEqual({
      outcome: 'accepted',
      messageId: 'wamid-test',
    });
  });
  it('does not send through a replacement number', async () => {
    const fetcher = vi.fn();
    expect(
      (await sendQueueItem(database('other'), item, fetcher)).outcome
    ).toBe('failed');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('fails closed when the outcome cannot be persisted; does not send again', async () => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: item })
        .mockResolvedValueOnce({ error: { message: 'db unavailable' } }),
    } as unknown as SupabaseClient;
    const send = vi
      .fn()
      .mockResolvedValue({ outcome: 'accepted', messageId: 'wamid' });
    await expect(processQueueTick(db, send)).rejects.toThrow('persistir');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
