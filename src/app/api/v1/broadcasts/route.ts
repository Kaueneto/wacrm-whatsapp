// ============================================================
// POST /api/v1/broadcasts — launch a template broadcast
// (scope: broadcasts:send).
//
// Body:
//   {
//     "name": "July promo",                 // optional label
//     "template_name": "promo_july",        // required, approved template
//     "template_language": "en_US",         // optional (default en_US)
//     "recipients": [                        // required, 1..1000
//       { "to": "+14155550123", "params": ["Jane"] },
//       { "to": "+14155550124" }
//     ]
//   }
//
// The broadcast + its recipient rows are persisted synchronously, then
// a durable worker processes the persisted queue. Poll
// `GET /api/v1/broadcasts/{id}` for progress.
//
// Response (202):
//   { "data": { "broadcast_id", "status": "sending",
//               "total_recipients", "accepted", "rejected" } }
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';

// This limit only bounds preparation. Delivery outlives the request.
export const maxDuration = 60;
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import { resolveAuditUserId, ContactError } from '@/lib/api/v1/contacts';
import { createBroadcast, BroadcastError } from '@/lib/whatsapp/broadcast-core';

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'broadcasts:send');

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const templateName =
      typeof body.template_name === 'string' ? body.template_name : '';
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];

    const auditUserId = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    const plan = await createBroadcast(
      ctx.supabase,
      ctx.accountId,
      auditUserId,
      {
        name: typeof body.name === 'string' ? body.name : null,
        templateName,
        templateLanguage:
          typeof body.template_language === 'string'
            ? body.template_language
            : null,
        recipients: recipients.map((r) => ({
          to: typeof r?.to === 'string' ? r.to : '',
          params: Array.isArray(r?.params) ? r.params : undefined,
        })),
      }
    );

    // Hand the persisted recipients to the independent worker.
    const { data: config } = await ctx.supabase
      .from('whatsapp_config')
      .select('waba_id')
      .eq('account_id', ctx.accountId)
      .single();
    const { error: queueError } = await ctx.supabase.rpc(
      'adopt_broadcast_queue',
      {
        p_id: plan.broadcastId,
        p_account: ctx.accountId,
        p_template: plan.templateRow ?? {
          name: plan.templateName,
          language: plan.templateLanguage,
        },
        p_phone: plan.phoneNumberId,
        p_waba: config?.waba_id,
      }
    );
    if (queueError)
      return fail(
        'internal',
        'Broadcast saved but queue unavailable; resume after restoring the worker.',
        503
      );

    return ok(
      {
        broadcast_id: plan.broadcastId,
        status: 'sending',
        total_recipients: plan.planned.length,
        accepted: plan.planned.length,
        rejected: plan.rejected,
        duplicates: plan.duplicates,
      },
      202
    );
  } catch (err) {
    if (err instanceof BroadcastError) {
      return fail(err.code, err.message, err.status);
    }
    if (err instanceof ContactError) {
      return fail(
        err.status === 400 ? 'bad_request' : 'internal',
        err.message,
        err.status
      );
    }
    return toApiErrorResponse(err);
  }
}
