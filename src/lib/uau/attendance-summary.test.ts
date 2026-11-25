import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { attendanceTranscript } from './attendance-summary';

const since = '2026-11-24T00:00:00Z',
  until = '2026-11-25T12:00:00Z';
function database(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  for (const fn of Object.values(chain)) fn.mockReturnValue(chain);
  chain.limit.mockResolvedValue({ data: rows, error: null });
  return { db: chain as unknown as SupabaseClient, chain };
}
describe('attendance evidence', () => {
  it('scopes the conversation and date range and preserves sender/time in chronological order', async () => {
    const { db, chain } = database([
      {
        sender_type: 'agent',
        content_text: 'Vou conferir.',
        created_at: until,
      },
      {
        sender_type: 'customer',
        content_text: 'Solicito boleto.',
        created_at: since,
      },
    ]);
    const out = await attendanceTranscript(db, 'conversation', since, until);
    expect(chain.eq).toHaveBeenCalledWith('conversation_id', 'conversation');
    expect(chain.eq).toHaveBeenCalledWith('content_type', 'text');
    expect(chain.gte).toHaveBeenCalledWith('created_at', since);
    expect(out.text.indexOf('Cliente: Solicito')).toBeLessThan(
      out.text.indexOf('Equipe: Vou')
    );
    expect(out).toMatchObject({ messageCount: 2, truncated: false });
  });
  it('reports truncated context and rejects empty or oversized periods', async () => {
    const { db } = database(
      Array.from({ length: 101 }, () => ({
        sender_type: 'customer',
        content_text: 'Oi',
        created_at: since,
      }))
    );
    expect(
      await attendanceTranscript(db, 'conversation', since, until)
    ).toMatchObject({ messageCount: 100, truncated: true });
    await expect(
      attendanceTranscript(db, 'conversation', '2026-01-01', until)
    ).rejects.toThrow();
    await expect(
      attendanceTranscript(database([]).db, 'conversation', since, until)
    ).rejects.toThrow();
  });
});
