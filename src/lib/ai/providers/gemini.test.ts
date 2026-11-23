import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateReply } from '../generate';
import { validateAiCredentials } from '../validate';
import { AI_PROVIDER_DEFAULT_MODEL } from '../defaults';
import type { AiConfig } from '../types';

const config: AiConfig = {
  provider: 'gemini',
  model: AI_PROVIDER_DEFAULT_MODEL.gemini,
  apiKey: 'test-google-key',
  baseUrl: 'https://untrusted.example',
  systemPrompt: 'Empresa de serviços. Não invente preços.',
  isActive: true,
  autoReplyEnabled: false,
  autoReplyMaxPerConversation: 3,
  handoffAgentId: null,
  embeddingsApiKey: null,
};
const args = {
  config,
  systemPrompt: config.systemPrompt!,
  messages: [
    { role: 'user' as const, content: 'Quais serviços vocês oferecem?' },
  ],
};
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());
function respond(content: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify(content), { status })
  );
}

describe('Gemini integration', () => {
  it('uses the official Google endpoint and carries the context, model and usage', async () => {
    respond({
      choices: [{ message: { content: 'Posso ajudar com nossos serviços.' } }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    });
    expect(await generateReply(args)).toEqual({
      text: 'Posso ajudar com nossos serviços.',
      handoff: false,
      usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    });
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    );
    expect(request?.headers).toEqual({
      Authorization: 'Bearer test-google-key',
      'Content-Type': 'application/json',
    });
    expect(request?.redirect).toBe('manual');
    expect(JSON.parse(request?.body as string)).toMatchObject({
      model: config.model,
      max_tokens: 1024,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: args.systemPrompt },
        ...args.messages,
      ],
    });
  });
  it('supports the same human handoff protocol', async () => {
    respond({ choices: [{ message: { content: '[[HANDOFF]]' } }] });
    expect(await generateReply(args)).toMatchObject({
      text: '',
      handoff: true,
    });
  });
  it('validates a key with a small connectivity request', async () => {
    respond({ choices: [{ message: { content: 'OK' } }] });
    await expect(validateAiCredentials(config)).resolves.toBeUndefined();
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).messages[1]
    ).toEqual({ role: 'user', content: 'ping' });
  });
  it.each([
    [403, 'invalid_key'],
    [429, 'rate_limited'],
    [500, 'provider_error'],
  ])('reports provider failure %i', async (status, code) => {
    respond(
      { error: { message: 'Google rejected the request' } },
      status as number
    );
    await expect(generateReply(args)).rejects.toMatchObject({ code });
  });
  it('handles empty responses and timeouts', async () => {
    respond({ choices: [] });
    await expect(generateReply(args)).rejects.toMatchObject({
      code: 'empty_response',
    });
    vi.mocked(fetch).mockRejectedValue(
      new DOMException('Timeout', 'TimeoutError')
    );
    await expect(generateReply(args)).rejects.toMatchObject({
      code: 'timeout',
    });
  });
});
