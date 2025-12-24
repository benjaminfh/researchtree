import OpenAI from 'openai';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
  type EnhancedGenerateContentResponse
} from '@google/generative-ai';
import type { ChatMessage } from './context';
import {
  toAnthropicThinking,
  toOpenAIReasoningEffort,
  type ThinkingSetting
} from '@/src/shared/thinking';
import { buildGeminiThinkingParams, buildOpenAIThinkingParams, getAnthropicMaxOutputTokens } from '@/src/shared/llmCapabilities';
import type { LLMProvider } from '@/src/shared/llmProvider';
import { getDefaultProvider, getEnabledProviders, getProviderEnvConfig } from '@/src/server/llmConfig';

export type { LLMProvider } from '@/src/shared/llmProvider';

export interface LLMStreamChunk {
  type: 'text';
  content: string;
}

export interface LLMStreamOptions {
  messages: ChatMessage[];
  signal?: AbortSignal;
  provider?: LLMProvider;
  thinking?: ThinkingSetting;
  webSearch?: boolean;
  apiKey?: string | null;
}

const encoder = new TextEncoder();
// TODO: Remove OpenAI search-preview routing once we migrate to Responses API web search.
const OPENAI_SEARCH_MODELS = new Set(['gpt-4o-search-preview', 'gpt-4o-mini-search-preview']);

function isOpenAISearchModel(modelName: string): boolean {
  return OPENAI_SEARCH_MODELS.has(modelName);
}

function getOpenAIModelForRequest(webSearch?: boolean): string {
  if (webSearch) {
    // Temporary: OpenAI web search only supported via chat completions + search preview models.
    return 'gpt-4o-mini-search-preview';
  }
  return getDefaultModelForProvider('openai');
}

export function resolveLLMProvider(requested?: LLMProvider): LLMProvider {
  if (requested) {
    const enabled = new Set(getEnabledProviders());
    return enabled.has(requested) ? requested : getDefaultProvider();
  }
  return getDefaultProvider();
}

export function getDefaultModelForProvider(provider: LLMProvider): string {
  const config = getProviderEnvConfig(provider);
  return config.defaultModel;
}

export async function* streamAssistantCompletion({
  messages,
  signal,
  provider,
  thinking,
  webSearch,
  apiKey
}: LLMStreamOptions): AsyncGenerator<LLMStreamChunk> {
  const resolvedProvider = resolveLLMProvider(provider);

  if (resolvedProvider === 'openai') {
    yield* streamFromOpenAI(messages, signal, thinking, webSearch, apiKey ?? undefined);
    return;
  }

  if (resolvedProvider === 'gemini') {
    yield* streamFromGemini(messages, signal, thinking, webSearch, apiKey ?? undefined);
    return;
  }

  if (resolvedProvider === 'anthropic') {
    yield* streamFromAnthropic(messages, signal, thinking, webSearch, apiKey ?? undefined);
    return;
  }

  yield* streamFromMock(messages, signal);
}

export function encodeChunk(content: string): Uint8Array {
  return encoder.encode(content);
}

async function* streamFromOpenAI(
  messages: ChatMessage[],
  signal?: AbortSignal,
  thinking?: ThinkingSetting,
  webSearch?: boolean,
  apiKeyOverride?: string
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = apiKeyOverride ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OpenAI API key. Add one in Profile to use this provider.');
  }

  const openAIClient = new OpenAI({ apiKey });

  const formattedMessages = messages.map((message) => ({
    role: message.role,
    content: message.content
  })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  const model = getOpenAIModelForRequest(webSearch);
  const baseRequest = {
    model,
    messages: formattedMessages,
    stream: true
  } as const;

  const thinkingParams = isOpenAISearchModel(model) ? {} : buildOpenAIThinkingParams(thinking);
  const stream: any = await openAIClient.chat.completions.create({
    ...baseRequest,
    ...thinkingParams,
    ...(webSearch ? { web_search_options: {} } : {})
  } as any);

  if (signal) {
    signal.addEventListener('abort', () => {
      if (typeof (stream as any).controller?.abort === 'function') {
        (stream as any).controller.abort();
      }
    });
  }

  for await (const part of stream) {
    const delta = part.choices[0]?.delta;
    if (!delta?.content) {
      continue;
    }

    if (typeof delta.content === 'string') {
      yield { type: 'text', content: delta.content } satisfies LLMStreamChunk;
      continue;
    }

    const blocks = (Array.isArray(delta.content) ? delta.content : []) as Array<{ type?: string; text?: string }>;
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string') {
        yield { type: 'text', content: block.text } satisfies LLMStreamChunk;
      }
    }
  }
}

async function* streamFromGemini(
  messages: ChatMessage[],
  signal?: AbortSignal,
  thinking?: ThinkingSetting,
  webSearch?: boolean,
  apiKeyOverride?: string
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = apiKeyOverride ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Add one in Profile to use this provider.');
  }

  const geminiClient = new GoogleGenerativeAI(apiKey);

  const systemInstruction = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
    .trim();
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }));

  const pickModel = (modelName: string) =>
    geminiClient.getGenerativeModel(systemInstruction ? { model: modelName, systemInstruction } : { model: modelName });

  const modelName = getDefaultModelForProvider('gemini');
  const model = pickModel(modelName);
  let stream: any;

  const request: any = { contents };

  if (typeof thinking === 'string') {
    const params = buildGeminiThinkingParams(modelName, thinking);
    if (params.generationConfig) {
      request.generationConfig = params.generationConfig;
    }
  }
  if (webSearch) {
    request.tools = [{ google_search: {} }];
  }

  function sanitizeGeminiErrorMessage(message: string): string {
    // Prevent accidental leakage of the API key (it can appear in SDK error URLs).
    return message.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
  }

  function getGeminiHttpStatus(error: unknown): number | null {
    const status = (error as any)?.status;
    return typeof status === 'number' ? status : null;
  }

  function throwIfStreamingNotSupported(error: unknown): void {
    const status = getGeminiHttpStatus(error);
    if (status !== 405) return;
    throw new Error(`Gemini model ${modelName} does not support streaming (HTTP 405).`);
  }

  function describeGeminiResponse(response: EnhancedGenerateContentResponse): Record<string, unknown> {
    const candidates = Array.isArray((response as any).candidates) ? (response as any).candidates : [];
    const first = candidates[0] ?? null;
    const parts = first?.content?.parts ?? null;
    const partKeys = Array.isArray(parts)
      ? parts
          .map((part: any) => Object.keys(part ?? {}).sort().join('+'))
          .filter(Boolean)
      : [];
    return {
      hasPromptFeedback: Boolean((response as any).promptFeedback),
      blockReason: (response as any).promptFeedback?.blockReason ?? null,
      candidates: candidates.length,
      finishReason: first?.finishReason ?? null,
      partKeys
    };
  }

  try {
    stream = await model.generateContentStream(request);
  } catch (error) {
    throwIfStreamingNotSupported(error);
    const status = getGeminiHttpStatus(error);
    if (error instanceof GoogleGenerativeAIFetchError || status != null) {
      throw new Error(
        sanitizeGeminiErrorMessage(`Gemini request failed: [${status ?? ''}] ${(error as Error)?.message ?? String(error)}`)
      );
    }
    throw error;
  }

  let yieldedAny = false;
  try {
    for await (const chunk of stream.stream) {
      if (signal?.aborted) {
        break;
      }
      let text = '';
      try {
        text = chunk.text();
      } catch (error) {
        if (error instanceof GoogleGenerativeAIResponseError) {
          throw new Error(sanitizeGeminiErrorMessage(`Gemini response error: ${error.message}`));
        }
        throw error;
      }
      if (text) {
        yieldedAny = true;
        yield { type: 'text', content: text } satisfies LLMStreamChunk;
      }
    }
  } catch (error) {
    throwIfStreamingNotSupported(error);
    const status = getGeminiHttpStatus(error);
    if (error instanceof GoogleGenerativeAIFetchError || status != null) {
      throw new Error(
        sanitizeGeminiErrorMessage(`Gemini request failed: [${status ?? ''}] ${(error as Error)?.message ?? String(error)}`)
      );
    }
    throw error;
  }

  if (!yieldedAny && !signal?.aborted) {
    try {
      const response = (await stream.response) as EnhancedGenerateContentResponse;
      let text = '';
      try {
        text = response.text();
      } catch (error) {
        if (error instanceof GoogleGenerativeAIResponseError) {
          throw new Error(sanitizeGeminiErrorMessage(`Gemini response error: ${error.message}`));
        }
        throw error;
      }
      if (text) {
        yield { type: 'text', content: text } satisfies LLMStreamChunk;
        return;
      }

      const meta = describeGeminiResponse(response);
      console.error('[LLM] Gemini returned empty response', { modelName, meta });
      throw new Error(`Gemini returned an empty response (model=${modelName}).`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(sanitizeGeminiErrorMessage(error.message));
      }
      throw error;
    }
  }
}

function extractSseEvents(buffer: string): { events: Array<{ event: string | null; data: string }>; rest: string } {
  const events: Array<{ event: string | null; data: string }> = [];
  let remaining = buffer;

  while (true) {
    const separatorIndex = remaining.indexOf('\n\n');
    if (separatorIndex === -1) break;

    const rawEvent = remaining.slice(0, separatorIndex);
    remaining = remaining.slice(separatorIndex + 2);

    let eventName: string | null = null;
    const dataLines: string[] = [];
    for (const line of rawEvent.split('\n')) {
      const trimmed = line.trimEnd();
      if (trimmed.startsWith('event:')) {
        eventName = trimmed.slice('event:'.length).trim();
        continue;
      }
      if (trimmed.startsWith('data:')) {
        dataLines.push(trimmed.slice('data:'.length).trimStart());
      }
    }

    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join('\n') });
    }
  }

  return { events, rest: remaining };
}

async function* streamFromAnthropic(
  messages: ChatMessage[],
  signal?: AbortSignal,
  thinking?: ThinkingSetting,
  webSearch?: boolean,
  apiKeyOverride?: string
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = apiKeyOverride ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Anthropic API key. Add one in Profile to use this provider.');
  }

  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content })) as Array<{ role: 'user' | 'assistant'; content: string }>;

  const model = getDefaultModelForProvider('anthropic');
  const maxOutputTokens = getAnthropicMaxOutputTokens(model);
  const maxTokens = maxOutputTokens ?? 8192;
  if (maxOutputTokens != null && maxTokens > maxOutputTokens) {
    throw new Error(`Anthropic request invalid: max_tokens (${maxTokens}) exceeds model max output (${maxOutputTokens}) for ${model}.`);
  }
  const baseBody: any = {
    model,
    max_tokens: maxTokens,
    system,
    messages: anthropicMessages,
    stream: true
  };

  if (thinking && thinking !== 'off') {
    baseBody.thinking = toAnthropicThinking(thinking);
    if (baseBody.thinking?.type === 'enabled') {
      const budget = Number(baseBody.thinking.budget_tokens);
      if (Number.isFinite(budget) && maxTokens <= budget) {
        throw new Error(
          `Anthropic request invalid: max_tokens (${maxTokens}) must be greater than thinking.budget_tokens (${budget}). ` +
            `Choose a lower Thinking setting.`
        );
      }
    }
  }
  if (webSearch) {
    baseBody.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5
      }
    ];
  }

  const makeRequest = async (body: any) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };
    const beta = (process.env.ANTHROPIC_BETA ?? '').trim();
    if (beta) {
      headers['anthropic-beta'] = beta;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });
    return res;
  };

  const response = await makeRequest(baseBody);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`[anthropic] ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
  }

  if (!response.body) {
    throw new Error('[anthropic] Missing response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal?.aborted) break;
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = extractSseEvents(buffer);
    buffer = rest;

    for (const evt of events) {
      if (evt.event === 'content_block_delta') {
        const parsed = JSON.parse(evt.data);
        const delta = parsed?.delta;
        if (delta?.type === 'text_delta' && typeof delta?.text === 'string') {
          yield { type: 'text', content: delta.text } satisfies LLMStreamChunk;
        }
      }
    }
  }
}

async function* streamFromMock(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<LLMStreamChunk> {
  const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
  const reply = lastUser ? `Echo: ${lastUser.content}` : 'Ready for instructions.';
  for (const token of reply.match(/.{1,80}/g) ?? []) {
    if (signal?.aborted) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    yield { type: 'text', content: token } satisfies LLMStreamChunk;
  }
}
