export const WHATSAPP_WEBHOOK_PATH = '/api/whatsapp/webhook';

export function normalizeWhatsAppWebhookUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/\.$/, '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !host.includes('.') ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      (/^(?:\d+\.){3}\d+$/.test(host) &&
        /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(
          host
        ))
    )
      return null;
    const path = url.pathname.replace(/\/+$/, '');
    return path === '' || path === WHATSAPP_WEBHOOK_PATH
      ? `${url.origin}${WHATSAPP_WEBHOOK_PATH}`
      : null;
  } catch {
    return null;
  }
}
