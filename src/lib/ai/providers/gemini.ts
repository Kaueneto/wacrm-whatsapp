import { AiError, type ProviderResult } from '../types';
import { MAX_OUTPUT_TOKENS } from '../defaults';
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared';
import { getT } from '@/lib/i18n/translate';

const t = getT('LibErrors');
// Official Gemini OpenAI-compatible endpoint. No user-supplied host or key in URL.
// https://ai.google.dev/gemini-api/docs/openai
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export async function generateGemini(
  args: ProviderArgs
): Promise<ProviderResult> {
  let response: Response;
  try {
    response = await fetch(GEMINI_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: args.model,
        messages: [
          { role: 'system', content: args.systemPrompt },
          ...mergeConsecutive(args.messages),
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        reasoning_effort: 'minimal',
      }),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch (error) {
    throw toNetworkError(error);
  }
  if (!response.ok) throw await providerHttpError('Gemini', response);
  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  } | null;
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new AiError(t('ai.emptyResponse', { provider: 'Gemini' }), {
      code: 'empty_response',
    });
  }
  return {
    text,
    usage: normalizeUsage({
      prompt: data?.usage?.prompt_tokens,
      completion: data?.usage?.completion_tokens,
      total: data?.usage?.total_tokens,
    }),
  };
}
