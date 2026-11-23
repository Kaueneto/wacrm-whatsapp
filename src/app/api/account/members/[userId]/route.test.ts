import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }),
  rateLimitResponse: vi.fn(),
  RATE_LIMITS: { adminAction: {} },
}));
vi.mock('@/lib/i18n/translate', () => ({ getT: () => (key: string) => key }));

import { PATCH } from './route';

const userId = '00000000-0000-0000-0000-000000000001';
const teamId = '00000000-0000-0000-0000-000000000002';
const params = { params: Promise.resolve({ userId }) };
function request(body: unknown) {
  return new Request(`http://localhost/api/account/members/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({
    userId: 'admin',
    supabase: { rpc: mocks.rpc },
  });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe('member editing', () => {
  it('saves the complete edit in one authorized RPC and deduplicates teams', async () => {
    const response = await PATCH(
      request({ name: ' Ana ', role: 'agent', teamIds: [teamId, teamId] }),
      params
    );
    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('edit_account_member', {
      p_user_id: userId,
      p_name: 'Ana',
      p_role: 'agent',
      p_team_ids: [teamId],
    });
  });

  it.each([
    null,
    'invalid',
    { name: '', role: 'agent', teamIds: [] },
    { name: 'Ana', role: 'invalid', teamIds: [] },
    { name: 'Ana', role: 'agent', teamIds: ['invalid'] },
    { name: 'Ana', role: 'agent' },
  ])('rejects invalid edits before writing: %j', async (body) => {
    expect((await PATCH(request(body), params)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps the existing role-only endpoint working', async () => {
    expect((await PATCH(request({ role: 'supervisor' }), params)).status).toBe(
      200
    );
    expect(mocks.rpc).toHaveBeenCalledWith('set_member_role', {
      p_user_id: userId,
      p_new_role: 'supervisor',
    });
  });

  it('returns database authorization and validation errors', async () => {
    mocks.rpc.mockResolvedValue({
      error: { code: '42501', message: 'Usuário fora da empresa.' },
    });
    const response = await PATCH(
      request({ name: 'Ana', role: 'agent', teamIds: [] }),
      params
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Usuário fora da empresa.',
    });
  });

  it('does not write when authentication fails', async () => {
    mocks.requireRole.mockRejectedValue(new Error('Forbidden'));
    expect(
      (
        await PATCH(
          request({ name: 'Ana', role: 'agent', teamIds: [] }),
          params
        )
      ).status
    ).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
