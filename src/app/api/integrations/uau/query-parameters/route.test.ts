import { beforeEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  role: vi.fn(),
  read: vi.fn(),
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
vi.mock('@/lib/uau/connection-store', () => ({
  withUauReadSession: (
    accountId: string,
    callback: (read: unknown) => Promise<unknown>
  ) => {
    expect(accountId).toBe('account-a');
    return callback(mocks.read);
  },
}));
import { POST } from './route';
const request = (body: unknown) =>
  new Request('http://localhost/api/integrations/uau/query-parameters', {
    method: 'POST',
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue({ accountId: 'account-a' });
  mocks.limit.mockReturnValue({ success: true });
  mocks.read.mockResolvedValue({
    Table: [{ Parametro: 'DiasAtraso', Descricao: 'Dias em atraso' }],
  });
});
describe('UAU query parameter route', () => {
  it('only discovers metadata for the selected query and never executes campaign SQL', async () => {
    const response = await POST(
      request({
        id: 123,
        custom: 1,
        parameters: [{ name: 'Other', value: 'private' }],
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.role).toHaveBeenCalledWith('admin');
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(
      'RotinasGerais/ConsultarParamConsultaGeral',
      { Id: 123, Personalizado: 1 }
    );
    expect(JSON.stringify(await response.json())).not.toContain('private');
  });
  it('supports UAU internal queries', async () => {
    await POST(request({ id: 1, custom: 0 }));
    expect(mocks.read).toHaveBeenCalledWith(
      'RotinasGerais/ConsultarParamConsultaGeral',
      { Id: 1, Personalizado: 0 }
    );
  });
  it('rejects invalid query selectors without any ERP call', async () => {
    for (const body of [
      null,
      { id: 0, custom: 1 },
      { id: 1.5, custom: 1 },
      { id: 1, custom: 2 },
      { id: '123', custom: 1 },
    ])
      expect((await POST(request(body))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('denies unauthenticated callers and enforces the rate limit', async () => {
    mocks.role.mockRejectedValueOnce(Error('denied'));
    expect((await POST(request({ id: 1, custom: 1 }))).status).toBe(403);
    mocks.limit.mockReturnValue({ success: false });
    expect((await POST(request({ id: 1, custom: 1 }))).status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('does not treat an unknown response format as a query without parameters', async () => {
    mocks.read.mockResolvedValue({ Table: [{ Unknown: 'value' }] });
    expect((await POST(request({ id: 1, custom: 1 }))).status).toBe(422);
  });
});
