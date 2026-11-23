import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyBroadcastRecipientStatus,
  broadcastReplyPhoneVariants,
  flagBroadcastReply,
} from './broadcast-recipient-webhook';

interface FakeRow {
  id: string;
  status: string;
  sent_at: string | null;
  whatsapp_message_id?: string;
}

function makeDb(rows: FakeRow[], options: { failUpdate?: boolean } = {}) {
  const updates: { filters: Record<string, unknown>; allowed: string[]; patch: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      expect(table).toBe('broadcast_recipients');
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: (column: string, value: unknown) => ({
            in: (_status: string, allowed: string[]) => ({
              select: () => {
                updates.push({ filters: { [column]: value }, allowed, patch });
                if (options.failUpdate) {
                  return Promise.resolve({ data: null, error: { message: 'boom' } });
                }
                const matched = rows.filter(
                  (r) =>
                    (column === 'id' ? r.id : r.whatsapp_message_id) === value &&
                    allowed.includes(r.status)
                );
                for (const r of matched) r.status = String(patch.status);
                return Promise.resolve({
                  data: matched.map((r) => ({ id: r.id })),
                  error: null,
                });
              },
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { db, updates };
}

describe('applyBroadcastRecipientStatus', () => {
  const event = (status: string) => ({
    whatsappMessageId: 'wamid.1',
    status,
    occurredAt: '2026-10-16T11:00:00.000Z',
    failure: null,
  });

  it('only updates rows whose current status may precede the incoming one', async () => {
    const { db, updates } = makeDb([
      { id: 'r1', status: 'sent', sent_at: null, whatsapp_message_id: 'wamid.1' },
    ]);
    await expect(applyBroadcastRecipientStatus(db, event('read'))).resolves.toBe('updated');
    expect(updates[0].filters).toEqual({ whatsapp_message_id: 'wamid.1' });
    expect(updates[0].allowed).toEqual(['pending', 'sent', 'delivered']);
    expect(updates[0].patch).toEqual({ status: 'read', read_at: '2026-10-16T11:00:00.000Z' });
  });

  it('is a no-op when a concurrent webhook already advanced the row', async () => {
    const rows = [{ id: 'r1', status: 'sent', sent_at: null, whatsapp_message_id: 'wamid.1' }];
    const { db } = makeDb(rows);
    await applyBroadcastRecipientStatus(db, event('read'));
    await expect(applyBroadcastRecipientStatus(db, event('delivered'))).resolves.toBe('skipped');
    expect(rows[0].status).toBe('read');
  });

  it('refuses failed once the recipient was delivered', async () => {
    const rows = [{ id: 'r1', status: 'delivered', sent_at: null, whatsapp_message_id: 'wamid.1' }];
    const { db, updates } = makeDb(rows);
    await expect(
      applyBroadcastRecipientStatus(db, {
        ...event('failed'),
        failure: { code: 131049, title: 'Blocked', details: 'ecosystem' },
      })
    ).resolves.toBe('skipped');
    expect(updates[0].allowed).toEqual(['pending', 'sent']);
    expect(updates[0].patch.error_message).toBe('[131049] Blocked: ecosystem');
    expect(rows[0].status).toBe('delivered');
  });

  it('skips unknown statuses without touching the database', async () => {
    const { db, updates } = makeDb([]);
    await expect(applyBroadcastRecipientStatus(db, event('deleted'))).resolves.toBe('skipped');
    expect(updates).toHaveLength(0);
  });

  it('reports a database error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = makeDb([], { failUpdate: true });
    await expect(applyBroadcastRecipientStatus(db, event('sent'))).resolves.toBe('error');
    error.mockRestore();
  });
});

describe('broadcast reply attribution', () => {
  it('pairs the two Brazilian mobile formats without changing landlines or foreign numbers', () => {
    expect(broadcastReplyPhoneVariants('+55 (62) 9876-1234')).toEqual(['556298761234', '5562998761234']);
    expect(broadcastReplyPhoneVariants('5562998761234')).toEqual(['5562998761234', '556298761234']);
    expect(broadcastReplyPhoneVariants('+55 (62) 3333-1234')).toEqual(['556233331234']);
    expect(broadcastReplyPhoneVariants('+14155551212')).toEqual(['14155551212']);
  });

  it('forwards the original event time and quoted Meta ID for scoped attribution', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'recipient-id', error: null });
    const occurredAt = '2026-10-16T12:00:00.000Z';
    await expect(flagBroadcastReply({ rpc } as unknown as SupabaseClient, {
      accountId: 'account', contactId: 'contact', occurredAt, phone: '556298761234', phoneNumberId: 'sender', replyTo: 'wamid.1',
    })).resolves.toBe('updated');
    expect(rpc).toHaveBeenCalledWith('record_broadcast_reply', {
      p_account: 'account', p_contact: 'contact', p_at: occurredAt, p_phone_variants: ['556298761234', '5562998761234'], p_sender: 'sender', p_reply_to: 'wamid.1',
    });
  });
});
