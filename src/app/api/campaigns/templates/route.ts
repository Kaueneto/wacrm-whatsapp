import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { fetchAccountTemplates } from '@/lib/settings/account-catalog';
import { decrypt } from '@/lib/whatsapp/encryption';
import { listAvailableCampaignTemplates } from '@/lib/whatsapp/verify-campaign-template';

export async function GET() {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `campaign-templates:${userId}`,
      RATE_LIMITS.whatsappHealth
    );
    if (!limit.success) return rateLimitResponse(limit);
    const { data: config, error } = await supabase
      .from('whatsapp_config')
      .select('waba_id,access_token')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!config?.waba_id)
      return Response.json(
        { error: 'Conecte o WhatsApp para escolher um template da campanha.' },
        { status: 400 }
      );
    const localTemplates = await fetchAccountTemplates(supabase, accountId);
    let templates;
    try {
      templates = await listAvailableCampaignTemplates(
        localTemplates,
        config.waba_id,
        decrypt(config.access_token)
      );
    } catch {
      return Response.json(
        {
          error:
            'Não foi possível consultar os templates do canal conectado. Atualize a página para tentar novamente.',
        },
        { status: 502 }
      );
    }
    return Response.json(
      { templates },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
