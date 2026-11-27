import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPortfolioSetup } from '@/lib/collections/setup';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  validate: vi.fn(),
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
vi.mock('@/lib/collections/query-validation', async (original) => ({
  ...(await original<object>()),
  validatePortfolioQueries: mocks.validate,
}));
import { POST } from './route';
const request = (patch = {}) =>
  new Request('http://localhost/api/integrations/uau/portfolio-validation', {
    method: 'POST',
    body: JSON.stringify({
      setup: defaultPortfolioSetup(),
      pilot: { company: 900, work: '00001', sale: 1 },
      ...patch,
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account-a' });
  mocks.limit.mockReturnValue({ success: true });
  mocks.validate.mockResolvedValue({
    discovery: [],
    reconciliation: [],
    persisted: false,
  });
});
describe('portfolio query validation endpoint', () => {
  it('allows automatic selection without a development pilot', async () => {
    const response = await POST(request({ pilot: undefined }));
    expect(response.status).toBe(200);
    expect(mocks.validate).toHaveBeenCalledExactlyOnceWith(
      'account-a',
      defaultPortfolioSetup(),
      undefined
    );
  });
  it('accepts a company/work pilot without requiring a sale', async () => {
    const response = await POST(
      request({ pilot: { company: 900, work: '00001' } })
    );
    expect(response.status).toBe(200);
    expect(mocks.validate).toHaveBeenCalledWith(
      'account-a',
      defaultPortfolioSetup(),
      expect.objectContaining({ company: 900, work: '00001' })
    );
  });
  it('uses the authenticated organization and returns a no-store read-only result', async () => {
    const response = await POST(request({ accountId: 'account-b' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.role).toHaveBeenCalledWith('admin');
    expect(mocks.validate).toHaveBeenCalledExactlyOnceWith(
      'account-a',
      defaultPortfolioSetup(),
      { company: 900, work: '00001', sale: 1 }
    );
  });
  it('rejects malformed XML identifiers before accessing the ERP', async () => {
    expect(
      (
        await POST(
          request({ pilot: { company: 900, work: "00001'", sale: 1 } })
        )
      ).status
    ).toBe(400);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
  it('enforces authentication and rate limits before any query', async () => {
    mocks.role.mockRejectedValueOnce(Error('denied'));
    expect((await POST(request())).status).toBe(403);
    mocks.limit.mockReturnValueOnce({ success: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});
