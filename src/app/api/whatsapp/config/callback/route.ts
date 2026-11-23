import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
  UnauthorizedError,
} from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  MetaApiError,
  updatePhoneWebhookCallback,
} from '@/lib/whatsapp/meta-api';
import { normalizeWhatsAppWebhookUrl } from '@/lib/whatsapp/webhook-callback-url';
import { parseAppSecrets } from '@/lib/whatsapp/webhook-signature';

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `whatsapp-admin:${userId}`,
      RATE_LIMITS.whatsappAdmin
    );
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    const callbackUrl =
      typeof body?.callbackUrl === 'string'
        ? normalizeWhatsAppWebhookUrl(body.callbackUrl)
        : null;
    if (!callbackUrl || callbackUrl.length > 200)
      return Response.json(
        {
          error:
            'Informe uma URL HTTPS pública de até 200 caracteres para o webhook.',
        },
        { status: 400 }
      );

    const { data: config, error } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id,access_token,verify_token')
      .eq('account_id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (
      !config ||
      !/^\d+$/.test(config.phone_number_id) ||
      !config.access_token ||
      !config.verify_token
    )
      return Response.json(
        {
          error:
            'Salve a conexão do WhatsApp, incluindo o token de verificação, antes de aplicar o webhook.',
        },
        { status: 400 }
      );
    if (config.phone_number_id !== body.phoneNumberId)
      return Response.json(
        {
          error:
            'O canal conectado mudou. Atualize a página e tente novamente.',
        },
        { status: 409 }
      );
    if (!parseAppSecrets(process.env.META_APP_SECRET).length)
      return Response.json(
        {
          error:
            'Configure META_APP_SECRET no servidor para validar os eventos recebidos.',
        },
        { status: 400 }
      );

    const accessToken = decrypt(config.access_token);
    const verifyToken = decrypt(config.verify_token);
    try {
      await updatePhoneWebhookCallback({
        phoneNumberId: config.phone_number_id,
        accessToken,
        verifyToken,
        callbackUrl,
      });
    } catch (error) {
      const reason =
        error instanceof MetaApiError && error.code != null
          ? ` (código ${error.code})`
          : '';
      return Response.json(
        {
          error: `Não foi possível confirmar o novo webhook na Meta${reason}. Confira se o túnel está aberto, se o token de verificação foi salvo e se o app está inscrito nos eventos de mensagens.`,
        },
        { status: 502 }
      );
    }
    return Response.json({ callbackUrl });
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof UnauthorizedError)
      return toErrorResponse(error);
    return Response.json(
      {
        error:
          'Falha ao carregar a configuração do WhatsApp para atualizar o webhook.',
      },
      { status: 500 }
    );
  }
}
