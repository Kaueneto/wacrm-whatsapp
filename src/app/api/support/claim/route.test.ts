import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, requireRole } = vi.hoisted(() => ({ rpc: vi.fn(), requireRole: vi.fn() }));
vi.mock('@/lib/auth/account', () => ({
  requireRole,
  toErrorResponse: () => Response.json({ error: 'Forbidden' }, { status: 403 }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ success: true }), RATE_LIMITS: { adminAction: {} }, rateLimitResponse: vi.fn(),
}));
import { POST } from './route';

const conversationId = '00000000-0000-0000-0000-000000000001';
function request(body: unknown) {
  return new Request('https://example.com/api/support/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  rpc.mockReset();
  requireRole.mockResolvedValue({ supabase: { rpc }, userId: 'agent' });
});

describe('claiming a team queue conversation', () => {
  it('rejects malformed identifiers before reaching the database', async () => {
    expect((await POST(request({ conversationId: 'invalid' }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('uses the authenticated claim RPC without accepting a caller-provided assignee', async () => {
    rpc.mockResolvedValue({ data: 'agent', error: null });
    const response = await POST(request({ conversationId, agentId: 'someone-else' }));
    expect(requireRole).toHaveBeenCalledWith('agent');
    expect(rpc).toHaveBeenCalledWith('claim_team_conversation', { p_conversation_id: conversationId });
    expect(await response.json()).toEqual({ conversationId, assignedAgentId: 'agent' });
  });
  it('reports a competing claim as a conflict', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001' } });
    expect((await POST(request({ conversationId }))).status).toBe(409);
  });
  it('does not expose database details on a rejected team claim', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private database details' } });
    const response = await POST(request({ conversationId }));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('private database details');
  });
});
