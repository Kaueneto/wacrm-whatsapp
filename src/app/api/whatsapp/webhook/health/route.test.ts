import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  auth: vi.fn(),
  found: true,
  queries: [] as {
    table: string;
    filters: [string, unknown][];
    patch?: unknown;
  }[],
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: h.auth,
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/whatsapp/webhook-connection', () => ({
  inspectWebhookConnection: async () => ({
    state: 'reachable',
    checked_at: new Date().toISOString(),
  }),
}));
vi.mock('@/lib/flows/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const record: {
        table: string;
        filters: [string, unknown][];
        patch?: unknown;
      } = { table, filters: [] };
      h.queries.push(record);
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          record.filters.push([column, value]);
          return chain;
        },
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        update: (patch: unknown) => {
          record.patch = patch;
          return chain;
        },
        maybeSingle: async () => ({
          data: h.found ? { id: '00000000-0000-0000-0000-000000000001' } : null,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data:
              table === 'whatsapp_webhook_worker_heartbeats'
                ? [{ seen_at: new Date().toISOString() }]
                : [],
            count: 0,
            error: null,
          }).then(resolve),
      };
      return chain;
    },
  }),
}));
import { GET, POST } from './route';
beforeEach(() => {
  h.auth.mockResolvedValue({ accountId: 'own-account' });
  h.queries.length = 0;
  h.found = true;
});
const id = '00000000-0000-0000-0000-000000000001';
function request(body: unknown) {
  return new Request('http://localhost/api/whatsapp/webhook/health', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
it('requires administration and scopes all event reads to the current account', async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(h.auth).toHaveBeenCalledWith('admin');
  for (const query of h.queries.filter(
    (q) => q.table === 'whatsapp_webhook_events'
  ))
    expect(query.filters).toContainEqual(['account_id', 'own-account']);
  const result = await response.json();
  expect(result.worker_online).toBe(true);
  expect(result).not.toHaveProperty('payload');
});
it('scopes recovery actions to the account and required event state', async () => {
  expect((await POST(request({ id, action: 'retry_failed' }))).status).toBe(
    200
  );
  expect(h.queries[0].filters).toContainEqual(['account_id', 'own-account']);
  expect(h.queries[0].filters).toContainEqual(['state', 'failed']);
  expect(h.queries[0].patch).toMatchObject({ state: 'pending', attempts: 0 });
});
it('returns not found rather than updating an event outside the account', async () => {
  h.found = false;
  expect((await POST(request({ id, action: 'reviewed' }))).status).toBe(404);
  expect(h.queries[0].filters).toContainEqual(['account_id', 'own-account']);
  expect(h.queries[0].filters).toContainEqual(['state', 'needs_review']);
});
it('rejects unauthorized requests without touching the queue', async () => {
  h.auth.mockRejectedValue(new Error('Forbidden'));
  expect((await GET()).status).toBe(403);
  expect(h.queries).toEqual([]);
});
