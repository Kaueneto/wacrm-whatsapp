import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPortfolioSetup } from '@/lib/collections/setup';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  upsert: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.role,
  toErrorResponse: () => Response.json({ error: 'denied' }, { status: 403 }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mocks.limit,
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
import { GET, PUT } from './route';
const request = (body: unknown) =>
  new Request('http://localhost/api/integrations/uau/portfolio-settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({
    accountId: 'account-a',
    userId: 'admin-a',
    supabase: { from: mocks.from },
  });
  mocks.from.mockReturnValue({ select: mocks.select, upsert: mocks.upsert });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.single });
  mocks.single.mockResolvedValue({ data: null, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.limit.mockReturnValue({ success: true });
});
describe('portfolio configuration API', () => {
  it('scopes reads to the authenticated organization and disables caching', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.role).toHaveBeenCalledWith('admin');
    expect(mocks.eq).toHaveBeenCalledWith('account_id', 'account-a');
  });
  it('persists only a draft for the current organization, ignoring supplied tenant or activation', async () => {
    const response = await PUT(
      request({
        ...defaultPortfolioSetup(),
        account_id: 'account-b',
        enabled: true,
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 'account-a',
        updated_by: 'admin-a',
        status: 'draft',
        setup: defaultPortfolioSetup(),
      })
    );
  });
  it('does not write malformed schedules', async () => {
    expect(
      (await PUT(request({ ...defaultPortfolioSetup(), times: ['29:00'] })))
        .status
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not report success if the storage layer fails', async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { code: '42P01' } });
    expect((await PUT(request(defaultPortfolioSetup()))).status).toBe(503);
  });
  it('denies unauthenticated writes and rate limits repeated saves', async () => {
    mocks.role.mockRejectedValueOnce(Error('denied'));
    expect((await PUT(request(defaultPortfolioSetup()))).status).toBe(403);
    mocks.limit.mockReturnValue({ success: false });
    expect((await PUT(request(defaultPortfolioSetup()))).status).toBe(429);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
