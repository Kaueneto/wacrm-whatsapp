import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppWebhookUrl } from './webhook-callback-url';

describe('WhatsApp webhook callback URLs', () => {
  it.each([
    'https://example.trycloudflare.com',
    'https://example.trycloudflare.com/',
    ' https://example.trycloudflare.com/api/whatsapp/webhook/ ',
  ])('produces a single callback path for %s', (value) => {
    expect(normalizeWhatsAppWebhookUrl(value)).toBe(
      'https://example.trycloudflare.com/api/whatsapp/webhook'
    );
  });

  it.each([
    'http://localhost:3000/api/whatsapp/webhook',
    'https://localhost:3000',
    'https://127.0.0.1',
    'https://192.168.1.4',
    'https://example.trycloudflare.com/dashboard',
    'https://user@example.trycloudflare.com',
    'https://example.trycloudflare.com?token=value',
    'https://example.trycloudflare.com/api/whatsapp/web hook',
    'https://exam\tple.trycloudflare.com',
    'https://example.trycloudflare.com/api/whats\napp/webhook',
    'https://exam\u200bple.trycloudflare.com',
  ])('rejects %s as a callback', (value) => {
    expect(normalizeWhatsAppWebhookUrl(value)).toBeNull();
  });
});
