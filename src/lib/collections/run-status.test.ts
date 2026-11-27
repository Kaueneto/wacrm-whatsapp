import { describe, expect, it } from 'vitest';
import { portfolioRunStatus } from './run-status';
describe('portfolio import status', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  it('stops reporting an expired lease as importing', () => {
    const run = {
      id: 'previous',
      state: 'running',
      expires_at: '2026-11-27T11:59:59Z',
      prepared: 331,
    };
    expect(portfolioRunStatus(run, now)).toMatchObject({
      state: 'failed',
      prepared: 331,
      error: expect.stringContaining('expirou'),
    });
    expect(run.state).toBe('running');
  });
  it('keeps a live run and its progress unchanged', () => {
    const run = {
      state: 'running',
      expires_at: '2026-11-27T12:01:00Z',
      prepared: 100,
      total_contracts: 213,
    };
    expect(portfolioRunStatus(run, now)).toBe(run);
  });
  it('preserves completed results and does not invent an execution', () => {
    const run = { state: 'succeeded', expires_at: '2026-11-27T11:00:00Z' };
    expect(portfolioRunStatus(run, now)).toBe(run);
    expect(portfolioRunStatus(null, now)).toBeNull();
  });
});
