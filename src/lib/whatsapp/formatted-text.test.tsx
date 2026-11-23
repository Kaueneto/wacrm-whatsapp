import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatsAppFormattedText } from './formatted-text';

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
});
