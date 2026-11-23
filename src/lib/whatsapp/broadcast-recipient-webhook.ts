import type { SupabaseClient } from '@supabase/supabase-js';

import { allowedPredecessors, isRecipientStatus } from '@/lib/broadcast-status';

import { normalizePhone } from '@/lib/whatsapp/phone-utils';

export interface RecipientStatusFailure {
  code: number;
  title: string;
  details: string | null;
}

export interface RecipientStatusEvent {
  whatsappMessageId: string;
  status: string;
  occurredAt: string;
  failure: RecipientStatusFailure | null;
}

export type RecipientStatusOutcome = 'updated' | 'skipped' | 'error';

function failureMessage(failure: RecipientStatusFailure): string {
  return (
    `[${failure.code}] ${failure.title}` +
    (failure.details ? `: ${failure.details}` : '')
  );
}

export async function applyBroadcastRecipientStatus(
  db: SupabaseClient,
  event: RecipientStatusEvent
): Promise<RecipientStatusOutcome> {
  if (!isRecipientStatus(event.status)) return 'skipped';
  const predecessors = allowedPredecessors(event.status);
  if (predecessors.length === 0) return 'skipped';

  const update: Record<string, unknown> = { status: event.status };
  if (event.status === 'sent') update.sent_at = event.occurredAt;
  if (event.status === 'delivered') update.delivered_at = event.occurredAt;
  if (event.status === 'read') update.read_at = event.occurredAt;
  if (event.failure) update.error_message = failureMessage(event.failure);

  const { data, error } = await db
    .from('broadcast_recipients')
    .update(update)
    .eq('whatsapp_message_id', event.whatsappMessageId)
    .in('status', predecessors)
    .select('id');

  if (error) {
    console.error('Error updating broadcast recipient status:', error);
    return 'error';
  }
  return data && data.length > 0 ? 'updated' : 'skipped';
}

export function broadcastReplyPhoneVariants(phone: string): string[] {
  const digits = normalizePhone(phone);
  if (!digits) return [];
  const brazilianMobile = /^(55[1-9]\d)(9?)([6-9]\d{7})$/.exec(digits);
  if (!brazilianMobile) return [digits];
  const [, prefix, ninthDigit, subscriber] = brazilianMobile;
  return [digits, `${prefix}${ninthDigit ? '' : '9'}${subscriber}`];
}

export async function flagBroadcastReply(
  db: SupabaseClient,
  event: {
    accountId: string;
    contactId: string;
    occurredAt: string;
    phone: string;
    phoneNumberId: string;
    replyTo?: string;
  }
): Promise<RecipientStatusOutcome> {
  const { data, error } = await db.rpc('record_broadcast_reply', {
    p_account: event.accountId,
    p_contact: event.contactId,
    p_at: event.occurredAt,
    p_phone_variants: broadcastReplyPhoneVariants(event.phone),
    p_sender: event.phoneNumberId,
    p_reply_to: event.replyTo ?? null,
  });

  if (error) {
    console.error('Error attributing broadcast reply:', error.code);
    return 'error';
  }
  return data ? 'updated' : 'skipped';
}
