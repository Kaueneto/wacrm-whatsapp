import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createBroadcast, BroadcastError } from '@/lib/whatsapp/broadcast-core';

// Legacy callers now enqueue a persisted execution instead of sending a batch
// inside an HTTP request. The dashboard uses /broadcast/enqueue directly.
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = await request.json();
    const db = supabaseAdmin();
    const recipients = Array.isArray(body.recipients)
      ? body.recipients.map((r: { phone: string; params?: string[] }) => ({
          to: r.phone,
          params: r.params,
        }))
      : Array.isArray(body.phone_numbers)
        ? body.phone_numbers.map((phone: string) => ({
            to: phone,
            params: body.template_params,
          }))
        : [];
    const plan = await createBroadcast(db, ctx.accountId, ctx.userId, {
      name: body.name,
      templateName: body.template_name,
      templateLanguage: body.template_language,
      recipients,
    });
    const { data: config } = await db
      .from('whatsapp_config')
      .select('waba_id')
      .eq('account_id', ctx.accountId)
      .single();
    const { error } = await db.rpc('adopt_broadcast_queue', {
      p_id: plan.broadcastId,
      p_account: ctx.accountId,
      p_template: plan.templateRow ?? {
        name: plan.templateName,
        language: plan.templateLanguage,
      },
      p_phone: plan.phoneNumberId,
      p_waba: config?.waba_id,
    });
    if (error) throw error;
    return NextResponse.json(
      {
        broadcast_id: plan.broadcastId,
        status: 'queued',
        total_recipients: plan.planned.length,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof BroadcastError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    return toErrorResponse(error);
  }
}
