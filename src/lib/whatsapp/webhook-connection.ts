import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from './encryption';
import { normalizeWhatsAppWebhookUrl } from './webhook-callback-url';
import { isDeliverableUrl } from '@/lib/webhooks/ssrf';

export interface WebhookConnection {
  state: 'reachable' | 'unreachable' | 'unknown' | 'unconfigured';
  checked_at: string;
}
const cache = new Map<
  string,
  { expires: number; value: Promise<WebhookConnection> }
>();

/** Read-only probe of the callback actually registered at Meta, cached per account. */
export function inspectWebhookConnection(
  db: SupabaseClient,
  accountId: string
): Promise<WebhookConnection> {
  const cached = cache.get(accountId);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = probe(db, accountId);
  if (cache.size > 1000) cache.clear();
  cache.set(accountId, { expires: Date.now() + 60000, value });
  return value;
}

async function probe(
  db: SupabaseClient,
  accountId: string
): Promise<WebhookConnection> {
  const result = (state: WebhookConnection['state']) => ({
    state,
    checked_at: new Date().toISOString(),
  });
  try {
    const { data, error } = await db
      .from('whatsapp_config')
      .select('phone_number_id,access_token')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) return result('unknown');
    if (!data?.access_token || !/^\d+$/.test(data.phone_number_id))
      return result('unconfigured');
    const meta = await fetch(
      `https://graph.facebook.com/v27.0/${data.phone_number_id}?fields=webhook_configuration`,
      {
        headers: { Authorization: `Bearer ${decrypt(data.access_token)}` },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      }
    );
    if (!meta.ok) return result('unknown');
    const body = await meta.json();
    const raw =
      body.webhook_configuration?.phone_number ||
      body.webhook_configuration?.application;
    if (typeof raw !== 'string') return result('unconfigured');
    const url = normalizeWhatsAppWebhookUrl(raw);
    if (!url) return result('unknown');
    // A callback is external input even when read back from Meta. Never probe private networks.
    if (!(await isDeliverableUrl(url))) return result('unreachable');
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
        cache: 'no-store',
      });
      // This route requires verification parameters: an unsigned GET returns this exact error.
      const value = await response.json().catch(() => null);
      return result(
        response.status === 400 &&
          value?.error === 'Missing verification parameters'
          ? 'reachable'
          : 'unreachable'
      );
    } catch {
      return result('unreachable');
    }
  } catch {
    return result('unknown');
  }
}
