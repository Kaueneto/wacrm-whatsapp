import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatsAppFormattedText } from './formatted-text';
import { NextIntlClientProvider } from 'next-intl';
import { MessageBubble } from '@/components/inbox/message-bubble';
import messages from '../../../messages/pt.json';
import { withAgentSignature } from './agent-signature';

describe('WhatsApp template formatting preview', () => {
  it('renders text formats and nested emphasis', () => {
    const html = renderToStaticMarkup(
      <WhatsAppFormattedText text={'*Olá _cliente_*! ~antes~ ```código```'} />
    ).replace(/<\/?span[^>]*>/g, '');
    expect(html).toContain('<strong>Olá <em>cliente</em></strong>');
    expect(html).toContain('<s>antes</s>');
    expect(html).toContain('>código</code>');
  });
  it('keeps HTML escaped and preserves links', () => {
    const html = renderToStaticMarkup(
      <WhatsAppFormattedText
        text={'*<script>alert(1)</script>* https://example.com'}
      />
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('href="https://example.com"');
  });
  it('renders the signed message in the real chat bubble with bold name and a blank line', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="pt" messages={messages} timeZone="America/Sao_Paulo">
        <MessageBubble message={{
          id: 'test', conversation_id: 'test', sender_type: 'agent',
          content_type: 'text', content_text: withAgentSignature('Olá! https://example.com', 'Rodrigo Rodrigues'),
          status: 'read', created_at: '2026-11-25T09:41:00-03:00',
        }} />
      </NextIntlClientProvider>
    );
    expect(html.replace(/<\/?span[^>]*>/g, '')).toContain('<strong>Rodrigo Rodrigues</strong>');
    expect(html).toContain('\n\nOlá!');
    expect(html).not.toContain('*Rodrigo Rodrigues*');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('text-primary-foreground underline');
  });
});
