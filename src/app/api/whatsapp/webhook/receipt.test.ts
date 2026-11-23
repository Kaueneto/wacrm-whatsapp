import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  persist: vi.fn(),
  drain: vi.fn(),
  callbacks: [] as (() => Promise<void>)[],
}));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, options?: { status: number }) =>
      Response.json(body, options),
  },
  after: (callback: () => Promise<void>) => h.callbacks.push(callback),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/whatsapp/webhook-signature', () => ({
  verifyMetaWebhookSignature: () => true,
}));
vi.mock('@/lib/whatsapp/webhook-queue', () => ({
  persistWebhookEnvelope: h.persist,
}));
vi.mock('@/lib/whatsapp/webhook-worker', () => ({
  drainWebhookInbox: h.drain,
}));
import { POST } from './route';
beforeEach(() => {
  vi.clearAllMocks();
  h.callbacks.length = 0;
  h.persist.mockResolvedValue(1);
  h.drain.mockResolvedValue({ done: 1 });
});
const request = () =>
  new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    body: JSON.stringify({ entry: [] }),
  });
describe('durable webhook acknowledgment', () => {
  it('does not acknowledge success before the database commit resolves', async () => {
    let commit!: () => void;
    h.persist.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          commit = resolve;
        })
    );
    const response = POST(request());
    await vi.waitFor(() => expect(h.persist).toHaveBeenCalled());
    expect(h.callbacks).toEqual([]);
    expect(h.drain).not.toHaveBeenCalled();
    commit();
    expect((await response).status).toBe(200);
    expect(h.callbacks).toHaveLength(1);
    await h.callbacks[0]();
    expect(h.drain).toHaveBeenCalledOnce();
  });
  it('returns a retryable response when persistence fails', async () => {
    h.persist.mockRejectedValue(new Error('database down'));
    expect((await POST(request())).status).toBe(503);
    expect(h.callbacks).toEqual([]);
  });
  it('keeps the accepted receipt durable when background processing fails', async () => {
    h.drain.mockRejectedValue(new Error('worker unavailable'));
    expect((await POST(request())).status).toBe(200);
    await expect(h.callbacks[0]()).resolves.toBeUndefined();
  });
});
