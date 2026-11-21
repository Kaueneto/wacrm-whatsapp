import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { buildSendComponents } from '@/lib/whatsapp/template-send-builder';
import type { MessageTemplate } from '@/types';
import { enqueueDefinition } from './prepare';
import { nextOccurrence } from './schedule';

export interface QueueItem {
  lease: string;
  recipient: {
    id: string;
    phone_snapshot: string;
    template_params: string[];
    attempt_count: number;
  };
  job: {
    broadcast_id: string;
    account_id: string;
    phone_number_id: string;
    waba_id: string;
    template_snapshot: MessageTemplate;
    header_media_url?: string;
  };
}
export type SendOutcome = {
  outcome: 'accepted' | 'failed' | 'unknown' | 'queued';
  messageId?: string;
  error?: string;
  delay?: number;
};

// Only explicit throttling is automatically retried. Transport errors and 5xx
// may happen after acceptance; these remain UNKNOWN for operator reconciliation.
export function classifyMetaResponse(
  httpStatus: number,
  code: number | undefined,
  attempts: number
): SendOutcome['outcome'] {
  if (
    httpStatus === 429 ||
    [130429, 131056, 131048, 80007, 4, 17, 613].includes(code ?? -1)
  )
    return attempts < 5 ? 'queued' : 'failed';
  if (httpStatus >= 500) return 'unknown';
  return 'failed';
}
export function retrySeconds(
  attempts: number,
  retryAfter?: string | null
): number {
  const requested = Number(retryAfter);
  return Math.min(
    3600,
    Math.max(
      Number.isFinite(requested) ? requested : 0,
      30 * 2 ** Math.min(attempts - 1, 6)
    )
  );
}

export async function sendQueueItem(
  db: SupabaseClient,
  item: QueueItem,
  fetcher: typeof fetch = fetch
): Promise<SendOutcome> {
  const { job, recipient } = item;
  const { data: config, error } = await db
    .from('whatsapp_config')
    .select('access_token,phone_number_id,waba_id')
    .eq('account_id', job.account_id)
    .single();
  if (
    error ||
    !config ||
    config.phone_number_id !== job.phone_number_id ||
    config.waba_id !== job.waba_id
  ) {
    return {
      outcome: 'failed',
      error:
        'Conexão WhatsApp alterada ou indisponível. O remetente original foi preservado.',
    };
  }
  let body: object;
  let accessToken: string;
  try {
    const template = job.template_snapshot;
    accessToken = decrypt(config.access_token);
    body = {
      messaging_product: 'whatsapp',
      to: recipient.phone_snapshot,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: buildSendComponents(template, {
          body: recipient.template_params,
          headerMediaUrl: job.header_media_url,
        }),
      },
    };
  } catch {
    return {
      outcome: 'failed',
      error: 'Credenciais ou parâmetros do template inválidos.',
    };
  }
  try {
    const response = await fetcher(
      `https://graph.facebook.com/v25.0/${job.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      }
    );
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.messages?.[0]?.id)
      return { outcome: 'accepted', messageId: payload.messages[0].id };
    if (response.ok)
      return {
        outcome: 'unknown',
        error:
          'Meta aceitou a requisição, mas não retornou o identificador da mensagem.',
      };
    const outcome = classifyMetaResponse(
      response.status,
      payload?.error?.code,
      recipient.attempt_count + 1
    );
    return {
      outcome,
      error: `[${payload?.error?.code ?? response.status}] ${payload?.error?.message ?? 'Falha na API da Meta'}`,
      delay:
        outcome === 'queued'
          ? retrySeconds(
              recipient.attempt_count + 1,
              response.headers.get('retry-after')
            )
          : 0,
    };
  } catch {
    return {
      outcome: 'unknown',
      error:
        'Resultado incerto após falha de rede/timeout. Não reenviado automaticamente.',
    };
  }
}

export async function processQueueTick(
  db: SupabaseClient,
  send = sendQueueItem
): Promise<boolean> {
  const { data, error } = await db.rpc('claim_broadcast_recipient');
  if (error) throw new Error(`Queue claim: ${error.message}`);
  if (!data) return false;
  const item = data as QueueItem;
  const result = await send(db, item);
  const { data: saved, error: saveError } = await db.rpc(
    'finish_broadcast_recipient',
    {
      p_id: item.recipient.id,
      p_lease: item.lease,
      p_outcome: result.outcome,
      p_message: result.messageId ?? null,
      p_error: result.error ?? null,
      p_delay: result.delay ?? 0,
    }
  );
  if (saveError || !saved)
    throw new Error(
      'Não foi possível persistir o resultado. O envio não será repetido automaticamente.'
    );
  return true;
}

export async function processScheduleTick(
  db: SupabaseClient
): Promise<boolean> {
  const { data: c, error } = await db.rpc('claim_due_campaign');
  if (error) throw new Error(`Schedule claim: ${error.message}`);
  if (!c) return false;
  try {
    await enqueueDefinition(
      db,
      c.account_id,
      c.user_id,
      c.name,
      c.definition,
      c.id,
      {
        lease: c.scheduler_lease,
        nextRun: nextOccurrence(c.schedule, new Date()),
      }
    );
  } catch (error) {
    // A bad source/template is visible to the operator, retried after five
    // minutes, rather than spinning or marking a campaign as successfully sent.
    const { error: saveError } = await db
      .from('campaigns')
      .update({
        last_error:
          error instanceof Error ? error.message : 'Falha ao preparar execução',
        scheduler_lease_until: new Date(Date.now() + 300000).toISOString(),
      })
      .eq('id', c.id)
      .eq('scheduler_lease', c.scheduler_lease);
    if (saveError)
      throw new Error('Não foi possível registrar a falha de programação.');
  }
  return true;
}
