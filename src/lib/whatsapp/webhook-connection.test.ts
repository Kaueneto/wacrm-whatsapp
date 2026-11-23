import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const h = vi.hoisted(() => ({ deliverable: vi.fn() }));
vi.mock('./encryption', () => ({ decrypt: () => 'private-test-key' }));
vi.mock('@/lib/webhooks/ssrf', () => ({ isDeliverableUrl: h.deliverable }));
import { inspectWebhookConnection } from './webhook-connection';
const db = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { phone_number_id: '123', access_token: 'encrypted' },
          error: null,
        }),
      }),
    }),
  }),
} as unknown as SupabaseClient;
beforeEach(() => {
  h.deliverable.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
it('checks the callback registered at Meta without forwarding credentials to it', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({
        webhook_configuration: {
          phone_number: 'https://test.example/api/whatsapp/webhook',
        },
      })
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: 'Missing verification parameters' },
        { status: 400 }
      )
    );
  expect((await inspectWebhookConnection(db, 'account-reachable')).state).toBe(
    'reachable'
  );
  expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toEqual({
    Authorization: 'Bearer private-test-key',
  });
  expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toBeUndefined();
  await inspectWebhookConnection(db, 'account-reachable');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('reports a broken tunnel and blocks callbacks resolving to private networks', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      webhook_configuration: {
        phone_number: 'https://bad.example/api/whatsapp/webhook',
      },
    })
  );
  h.deliverable.mockResolvedValue(false);
  expect((await inspectWebhookConnection(db, 'account-private')).state).toBe(
    'unreachable'
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not mistake a generic HTTP response for a working webhook endpoint', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({
        webhook_configuration: {
          phone_number: 'https://other.example/api/whatsapp/webhook',
        },
      })
    )
    .mockResolvedValueOnce(new Response('not this app', { status: 200 }));
  expect(
    (await inspectWebhookConnection(db, 'account-wrong-route')).state
  ).toBe('unreachable');
});
it('reports API failures as unknown rather than claiming the tunnel is working', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({ error: { code: 190 } }, { status: 401 })
  );
  expect((await inspectWebhookConnection(db, 'account-auth-error')).state).toBe(
    'unknown'
  );
});
