import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

interface Entry {
  id: string;
  changes: { field: string; value: Record<string, unknown> }[];
}
export interface WebhookEnvelope {
  entry?: Entry[];
}
export interface QueuedWebhook {
  id: string;
  lease_token: string;
  account_id: string | null;
  payload: unknown;
  attempts: number;
  phase: string;
  received_at: string;
}
export interface WebhookReceipt {
  id: string;
  token: string;
  beginEffects: () => Promise<void>;
}
export class WebhookReviewRequired extends Error {}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** One message/status per durable receipt: independent retries, FIFO per sender. */
export function splitWebhookEvents(body: WebhookEnvelope) {
  const events: {
    key: string;
    partition: string;
    phone_id: string;
    waba_id: string;
    payload: WebhookEnvelope;
  }[] = [];
  for (const entry of body.entry ?? [])
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phone = String(
        (value.metadata as { phone_number_id?: string } | undefined)
          ?.phone_number_id ?? ''
      );
      const base = phone || entry.id;
      const append = (
        identity: string,
        sender: string,
        next: Record<string, unknown>
      ) =>
        events.push({
          key: hash(base + ':' + change.field + ':' + identity),
          partition: hash(base + ':' + sender),
          phone_id: phone,
          waba_id: entry.id,
          payload: {
            entry: [
              { id: entry.id, changes: [{ field: change.field, value: next }] },
            ],
          },
        });
      const messages = Array.isArray(value.messages)
        ? (value.messages as Record<string, unknown>[])
        : [];
      const statuses = Array.isArray(value.statuses)
        ? (value.statuses as Record<string, unknown>[])
        : [];
      messages.forEach((message, index) => {
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const { statuses: _statuses, ...rest } = value;
        void _statuses;
        append(
          'message:' + String(message.id),
          String(message.from || message.from_user_id || 'unknown'),
          {
            ...rest,
            messages: [message],
            contacts: contacts.length
              ? [contacts[index] || contacts[0]]
              : undefined,
          }
        );
      });
      for (const status of statuses) {
        const { messages: _messages, ...rest } = value;
        void _messages;
        append(
          `status:${status.id}:${status.status}:${status.timestamp}`,
          'status:' + String(status.id),
          { ...rest, statuses: [status] }
        );
      }
      if (!messages.length && !statuses.length)
        append(canonical(value), 'other', value);
    }
  return events;
}

export async function persistWebhookEnvelope(
  db: SupabaseClient,
  body: WebhookEnvelope
): Promise<number> {
  const events = splitWebhookEvents(body);
  if (!events.length) return 0;
  const { data, error } = await db.rpc('enqueue_whatsapp_webhooks', {
    p_events: events,
  });
  if (error) throw new Error('Could not persist incoming webhook');
  return Number(data ?? 0);
}

export function webhookRetryDelay(attempt: number): number {
  return Math.min(900, 5 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
}
function safeError(error: unknown): string {
  const text =
    error instanceof Error ? error.message : 'Webhook processing failed';
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/(?:AIza|sk-|AQ\.)[A-Za-z0-9_.-]+/g, '[redacted]')
    .slice(0, 500);
}

export async function processQueuedWebhooks(
  db: SupabaseClient,
  process: (payload: unknown, receipt: WebhookReceipt) => Promise<void>,
  { limit = 8, budgetMs = 45000 } = {}
): Promise<{ done: number; retried: number; failed: number }> {
  const totals = { done: 0, retried: 0, failed: 0 };
  const started = Date.now();
  for (
    let index = 0;
    index < limit && Date.now() - started < budgetMs;
    index++
  ) {
    const { data, error } = await db.rpc('claim_whatsapp_webhook');
    if (error) throw new Error('Could not claim webhook receipt');
    const job = (data as QueuedWebhook[] | null)?.[0];
    if (!job) break;
    let effectsStarted = job.phase === 'effects_started';
    const heartbeat = setInterval(() => {
      void db
        .from('whatsapp_webhook_events')
        .update({ lease_until: new Date(Date.now() + 120000).toISOString() })
        .eq('id', job.id)
        .eq('lease_token', job.lease_token)
        .eq('state', 'processing')
        .then(({ error }) => {
          if (error) console.error('[webhook queue] Lease heartbeat failed');
        });
    }, 30000);
    heartbeat.unref?.();
    let patch: Record<string, unknown>;
    try {
      if (effectsStarted)
        throw new WebhookReviewRequired(
          'A previous attempt stopped during automation; review the conversation before replaying.'
        );
      if (!job.account_id)
        throw new Error('Incoming channel is not mapped to an account');
      await process(job.payload, {
        id: job.id,
        token: job.lease_token,
        beginEffects: async () => {
          const { data, error } = await db.rpc(
            'begin_whatsapp_webhook_effects',
            { p_id: job.id, p_token: job.lease_token }
          );
          if (error || data !== true)
            throw new WebhookReviewRequired(
              'Could not acquire the automation checkpoint'
            );
          effectsStarted = true;
        },
      });
      patch = {
        state: 'done',
        finished_at: new Date().toISOString(),
        last_error: null,
      };
      totals.done++;
    } catch (error) {
      const review = effectsStarted || error instanceof WebhookReviewRequired;
      const failed = review || job.attempts >= 20;
      patch = {
        state: review ? 'needs_review' : failed ? 'failed' : 'pending',
        last_error: safeError(error),
        available_at: new Date(
          Date.now() + 1000 * webhookRetryDelay(job.attempts)
        ).toISOString(),
      };
      if (failed) totals.failed++;
      else totals.retried++;
    } finally {
      clearInterval(heartbeat);
    }
    const { error: updateError } = await db
      .from('whatsapp_webhook_events')
      .update({ ...patch, lease_until: null, lease_token: null })
      .eq('id', job.id)
      .eq('lease_token', job.lease_token);
    if (updateError)
      throw new Error(
        'Could not settle webhook receipt; lease will recover it'
      );
  }
  return totals;
}
