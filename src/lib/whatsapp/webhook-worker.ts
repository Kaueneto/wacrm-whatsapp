import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { processWebhook, type WhatsAppWebhookBody } from './webhook-processor';
import { processQueuedWebhooks } from './webhook-queue';

export function drainWebhookInbox(
  db: SupabaseClient = supabaseAdmin(),
  options = {}
) {
  return processQueuedWebhooks(
    db,
    (payload, receipt) =>
      processWebhook(payload as WhatsAppWebhookBody, { receipt }),
    options
  );
}
