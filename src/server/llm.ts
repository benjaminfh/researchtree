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
  type ThinkingSetting
} from '@/src/shared/thinking';
import {
  buildGeminiThinkingParams,
  buildOpenAIResponsesThinkingParams,
  buildOpenAIThinkingParams,
  getAnthropicMaxOutputTokens
} from '@/src/shared/llmCapabilities';
import type { LLMProvider } from '@/src/shared/llmProvider';
import { getDefaultProvider, getEnabledProviders, getOpenAIUseResponses, getProviderEnvConfig } from '@/src/server/llmConfig';
import { flattenMessageContent, type ThinkingContentBlock } from '@/src/shared/thinkingTraces';
import { extractGeminiTextData, extractGeminiThoughtData, getGeminiDelta } from '@/src/server/geminiThought';

export type { LLMProvider } from '@/src/shared/llmProvider';

export interface LLMStreamChunk {
  type: 'text' | 'thinking' | 'thinking_signature' | 'raw_response';
  content: string;
  append?: boolean;
  payload?: unknown;
}

export interface LLMStreamOptions {
  messages: ChatMessage[];
  signal?: AbortSignal;
  provider?: LLMProvider;
  model?: string;
  thinking?: ThinkingSetting;
  webSearch?: boolean;
  apiKey?: string | null;
  previousResponseId?: string | null;
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

export function resolveOpenAIProviderSelection(requested?: LLMProvider | null): LLMProvider {
  if (!requested || requested === 'openai') {
    return getOpenAIUseResponses() ? 'openai_responses' : 'openai';
  }
  return requested;
}

export function getDefaultModelForProvider(provider: LLMProvider): string {
  const config = getProviderEnvConfig(provider);
  return config.defaultModel;
}

export async function* streamAssistantCompletion({
  messages,
  signal,
  provider,
  model,
  thinking,
  webSearch,
  apiKey,
  previousResponseId
}: LLMStreamOptions): AsyncGenerator<LLMStreamChunk> {
  const resolvedProvider = provider ?? resolveOpenAIProviderSelection();
  const enabled = new Set(getEnabledProviders());
  if (!enabled.has(resolvedProvider)) {
    throw new Error(`Provider ${resolvedProvider} is not enabled.`);
  }

  if (resolvedProvider === 'openai') {
    yield* streamFromOpenAI(messages, signal, thinking, webSearch, apiKey ?? undefined, model);
    return;
  }

  if (resolvedProvider === 'openai_responses') {
    yield* streamFromOpenAIResponses(messages, signal, thinking, webSearch, apiKey ?? undefined, model, previousResponseId);
    return;
  }

  if (resolvedProvider === 'gemini') {
    yield* streamFromGemini(messages, signal, thinking, webSearch, apiKey ?? undefined, model);
    return;
  }

  if (resolvedProvider === 'anthropic') {
    yield* streamFromAnthropic(messages, signal, thinking, webSearch, apiKey ?? undefined, model);
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
  apiKeyOverride?: string,
  modelOverride?: string
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = apiKeyOverride ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OpenAI API key. Add one in Profile to use this provider.');
  }

  const openAIClient = new OpenAI({ apiKey });

  const formattedMessages = messages.map((message) => ({
    role: message.role,
    content: flattenMessageContent(message.content)
  })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  const model = webSearch
    ? modelOverride && isOpenAISearchModel(modelOverride)
      ? modelOverride
      : getOpenAIModelForRequest(true)
    : modelOverride ?? getDefaultModelForProvider('openai');
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

  const rawParts: unknown[] = [];
  for await (const part of stream) {
    rawParts.push(part);
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
  yield { type: 'raw_response', content: '', payload: rawParts } satisfies LLMStreamChunk;
}

function toOpenAIResponsesInput(messages: ChatMessage[]): {
  instructions?: string;
  input: Array<{ role: 'user'; content: Array<{ type: 'input_text'; text: string }> }>;
} {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => flattenMessageContent(message.content))
    .join('\n\n')
    .trim();

  let lastUserText = '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'user') continue;
    const text = flattenMessageContent(message.content).trim();
    if (text) {
      lastUserText = text;
      break;
    }
  }

  const input = lastUserText
    ? [
        {
          role: 'user' as const,
          content: [{ type: 'input_text' as const, text: lastUserText }]
        }
      ]
    : [];

  return {
    ...(instructions ? { instructions } : {}),
    input
  };
}

function extractOpenAIResponsesTextDelta(event: any): string | null {
  if (!event || typeof event !== 'object') return null;
  if (event.type !== 'response.output_text.delta') return null;
  if (typeof event.delta === 'string') return event.delta;
  if (typeof event.text === 'string') return event.text;
  if (typeof event.delta?.text === 'string') return event.delta.text;
  return null;
}

async function* streamFromOpenAIResponses(
  messages: ChatMessage[],
  signal?: AbortSignal,
  thinking?: ThinkingSetting,
  webSearch?: boolean,
  apiKeyOverride?: string,
  modelOverride?: string,
  previousResponseId?: string | null
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = apiKeyOverride ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OpenAI API key. Add one in Profile to use this provider.');
  }

  const openAIClient = new OpenAI({ apiKey });
  const model = modelOverride ?? getDefaultModelForProvider('openai_responses');
  const { instructions, input } = toOpenAIResponsesInput(messages);
  const thinkingParams = buildOpenAIResponsesThinkingParams(thinking);

  const stream: any = await openAIClient.responses.create({
    model,
    input,
    stream: true,
    ...(instructions ? { instructions } : {}),
    ...thinkingParams,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    ...(webSearch ? { tools: [{ type: 'web_search_preview' }] } : {})
  } as any);

  if (signal) {
    signal.addEventListener('abort', () => {
      if (typeof (stream as any).controller?.abort === 'function') {
        (stream as any).controller.abort();
      }
    });
  }

  const rawEvents: unknown[] = [];
  let responseId: string | null = null;
  for await (const event of stream) {
    rawEvents.push(event);
    const delta = extractOpenAIResponsesTextDelta(event);
    if (typeof delta === 'string' && delta.length > 0) {
      yield { type: 'text', content: delta } satisfies LLMStreamChunk;
    }
    const candidate =
      typeof (event as any)?.response?.id === 'string'
        ? String((event as any).response.id)
        : typeof (event as any)?.response_id === 'string'
          ? String((event as any).response_id)
          : event?.type === 'response.completed' && typeof (event as any)?.id === 'string'
            ? String((event as any).id)
            : null;
    if (candidate) {
      responseId = candidate;
    }
  }

  yield {
    type: 'raw_response',
    content: '',
    payload: responseId ? { events: rawEvents, responseId } : rawEvents
  } satisfies LLMStreamChunk;
}

async function* streamFromGemini(
  messages: ChatMessage[],
  signal?: AbortSignal,
  thinking?: ThinkingSetting,
  webSearch?: boolean,
  apiKeyOverride?: string,
  modelOverride?: string
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = apiKeyOverride ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Gemini API key. Add one in Profile to use this provider.');
  }

  const geminiClient = new GoogleGenerativeAI(apiKey);

  const systemInstruction = messages
    .filter((message) => message.role === 'system')
    .map((message) => flattenMessageContent(message.content))
    .join('\n\n')
    .trim();
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      if (Array.isArray(message.content)) {
        const parts = message.content.flatMap((block) => {
          if (block.type === 'text' && typeof block.text === 'string') {
            return [{ text: block.text }];
          }
          if (block.type === 'thinking_signature' && typeof block.signature === 'string') {
            return [{ text: '', thoughtSignature: block.signature }];
          }
          return [];
        });
        return {
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: parts.length > 0 ? parts : [{ text: '' }]
        };
      }
      return {
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: flattenMessageContent(message.content) }]
      };
    });

  const pickModel = (modelName: string) =>
    geminiClient.getGenerativeModel(systemInstruction ? { model: modelName, systemInstruction } : { model: modelName });

  const modelName = modelOverride ?? getDefaultModelForProvider('gemini');
  const model = pickModel(modelName);
  let stream: any;

  const request: any = { contents };
  const debugThoughts = process.env.RT_GEMINI_DEBUG_THOUGHTS === 'true';

  if (typeof thinking === 'string') {
    const params = buildGeminiThinkingParams(modelName, thinking);
    if (params.generationConfig) {
      request.generationConfig = params.generationConfig;
    }
  }
  if (thinking && thinking !== 'off') {
    request.generationConfig = request.generationConfig ?? {};
    request.generationConfig.thinkingConfig = {
      ...(request.generationConfig.thinkingConfig ?? {}),
      includeThoughts: true
    };
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
  let lastThinkingText = '';
  let lastThinkingSignature = '';
  let lastTextSnapshot = '';
  const rawChunks: unknown[] = [];
  try {
    for await (const chunk of stream.stream) {
      if (signal?.aborted) {
        break;
      }
      rawChunks.push(chunk);
      if (debugThoughts) {
        const candidates = Array.isArray((chunk as any)?.candidates) ? (chunk as any).candidates : [];
        for (const candidate of candidates) {
          const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
          const thoughtParts = parts
            .map((part: any, idx: number) => ({
              idx,
              thought: Boolean(part?.thought),
              text: typeof part?.text === 'string' ? part.text.trim() : ''
            }))
            .filter((part: { thought: boolean; text: string }) => part.thought || part.text.length > 0);
          if (thoughtParts.length > 0) {
            const preview = thoughtParts
              .map((part: { idx: number; thought: boolean; text: string }) => {
                const snippet = part.text.length > 120 ? `${part.text.slice(0, 120)}…` : part.text;
                return `#${part.idx} thought=${part.thought} "${snippet}"`;
              })
              .join(' | ');
            console.info('[LLM][Gemini] stream parts', { modelName, preview });
          }
        }
      }
      const thoughtData = extractGeminiThoughtData(chunk);
      if (thoughtData.hasParts) {
        const { delta: thoughtDelta, updated } = getGeminiDelta(thoughtData.thoughtText, lastThinkingText);
        if (thoughtDelta) {
          yield { type: 'thinking', content: thoughtDelta, append: true } satisfies LLMStreamChunk;
        }
        lastThinkingText = updated;
        if (thoughtData.signature && thoughtData.signature !== lastThinkingSignature) {
          yield { type: 'thinking_signature', content: thoughtData.signature, append: false } satisfies LLMStreamChunk;
          lastThinkingSignature = thoughtData.signature;
        }
      }

      let text = '';
      const textData = extractGeminiTextData(chunk);
      if (textData.hasParts) {
        text = textData.text;
      } else {
        try {
          text = chunk.text();
        } catch (error) {
          if (error instanceof GoogleGenerativeAIResponseError) {
            throw new Error(sanitizeGeminiErrorMessage(`Gemini response error: ${error.message}`));
          }
          throw error;
        }
      }
      if (text) {
        const { delta, updated } = getGeminiDelta(text, lastTextSnapshot);
        if (delta) {
          yieldedAny = true;
          yield { type: 'text', content: delta } satisfies LLMStreamChunk;
        }
        lastTextSnapshot = updated;
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

  if (!signal?.aborted) {
    try {
      const response = (await stream.response) as EnhancedGenerateContentResponse;
      const rawResponse = {
        stream: rawChunks,
        response
      };
      if (debugThoughts) {
        const candidates = Array.isArray((response as any)?.candidates) ? (response as any).candidates : [];
        for (const candidate of candidates) {
          const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
          const thoughtParts = parts
            .map((part: any, idx: number) => ({
              idx,
              thought: Boolean(part?.thought),
              text: typeof part?.text === 'string' ? part.text.trim() : ''
            }))
            .filter((part: { thought: boolean; text: string }) => part.thought || part.text.length > 0);
          if (thoughtParts.length > 0) {
            const preview = thoughtParts
              .map((part: { idx: number; thought: boolean; text: string }) => {
                const snippet = part.text.length > 120 ? `${part.text.slice(0, 120)}…` : part.text;
                return `#${part.idx} thought=${part.thought} "${snippet}"`;
              })
              .join(' | ');
            console.info('[LLM][Gemini] response parts', { modelName, preview });
          }
        }
      }
      const responseThought = extractGeminiThoughtData(response);
      if (responseThought.hasParts) {
        const { delta: thoughtDelta, updated } = getGeminiDelta(responseThought.thoughtText, lastThinkingText);
        if (thoughtDelta) {
          yield { type: 'thinking', content: thoughtDelta, append: true } satisfies LLMStreamChunk;
        }
        lastThinkingText = updated;
        if (responseThought.signature && responseThought.signature !== lastThinkingSignature) {
          yield { type: 'thinking_signature', content: responseThought.signature, append: false } satisfies LLMStreamChunk;
          lastThinkingSignature = responseThought.signature;
        }
      }

      let text = '';
      const responseText = extractGeminiTextData(response);
      if (responseText.hasParts) {
        text = responseText.text;
      } else {
        try {
          text = response.text();
        } catch (error) {
          if (error instanceof GoogleGenerativeAIResponseError) {
            throw new Error(sanitizeGeminiErrorMessage(`Gemini response error: ${error.message}`));
          }
          throw error;
        }
      }
      if (text) {
        const { delta, updated } = getGeminiDelta(text, lastTextSnapshot);
        if (delta) {
          yieldedAny = true;
          yield { type: 'text', content: delta } satisfies LLMStreamChunk;
        }
        lastTextSnapshot = updated;
      }
      if (yieldedAny) {
        yield { type: 'raw_response', content: '', payload: rawResponse } satisfies LLMStreamChunk;
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
  apiKeyOverride?: string,
  modelOverride?: string
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = apiKeyOverride ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Missing Anthropic API key. Add one in Profile to use this provider.');
  }

  const systemText = flattenMessageContent(messages.find((m) => m.role === 'system')?.content ?? '');
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (Array.isArray(m.content)) {
        const blocks: ThinkingContentBlock[] = [];
        for (const block of m.content) {
          if (block.type === 'thinking') {
            const next: { type: 'thinking'; thinking: string; signature?: string } = {
              type: 'thinking',
              thinking: String(block.thinking ?? '')
            };
            if (block.signature) {
              next.signature = String(block.signature);
            }
            blocks.push(next);
            continue;
          }
          if (block.type === 'text') {
            blocks.push({ type: 'text', text: String(block.text ?? '') });
            continue;
          }
          if (block.type === 'thinking_signature') {
            blocks.push({
              type: 'thinking',
              thinking: '',
              signature: String(block.signature ?? '')
            });
            continue;
          }
          blocks.push(block);
        }
        return { role: m.role, content: blocks };
      }
      return { role: m.role, content: m.content };
    }) as Array<{ role: 'user' | 'assistant'; content: string | ThinkingContentBlock[] }>;

  const model = modelOverride ?? getDefaultModelForProvider('anthropic');
  const maxOutputTokens = getAnthropicMaxOutputTokens(model);
  const maxTokens = maxOutputTokens ?? 8192;
  if (maxOutputTokens != null && maxTokens > maxOutputTokens) {
    throw new Error(`Anthropic request invalid: max_tokens (${maxTokens}) exceeds model max output (${maxOutputTokens}) for ${model}.`);
  }
  const baseBody: any = {
    model,
    max_tokens: maxTokens,
    system: systemText,
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

  const contentBlocks = new Map<number, { type: string; signature?: string }>();
  const rawEvents: Array<{ event: string | null; data: string }> = [];
  while (true) {
    if (signal?.aborted) break;
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = extractSseEvents(buffer);
    buffer = rest;

    for (const evt of events) {
      rawEvents.push(evt);
      if (evt.event === 'content_block_start') {
        const parsed = JSON.parse(evt.data);
        const index = Number(parsed?.index ?? -1);
        const block = parsed?.content_block;
        if (Number.isFinite(index) && block?.type) {
          const signature = typeof block.signature === 'string' ? block.signature : undefined;
          contentBlocks.set(index, { type: block.type, signature });
        }
        continue;
      }
      if (evt.event === 'content_block_stop') {
        const parsed = JSON.parse(evt.data);
        const index = Number(parsed?.index ?? -1);
        const cached = Number.isFinite(index) ? contentBlocks.get(index) : null;
        if (cached?.type === 'thinking' && cached.signature) {
          yield { type: 'thinking_signature', content: cached.signature, append: false } satisfies LLMStreamChunk;
        }
        continue;
      }
      if (evt.event === 'content_block_delta') {
        const parsed = JSON.parse(evt.data);
        const index = Number(parsed?.index ?? -1);
        const delta = parsed?.delta;
        if (delta?.type === 'thinking_delta' && typeof delta?.thinking === 'string') {
          yield { type: 'thinking', content: delta.thinking, append: true } satisfies LLMStreamChunk;
          continue;
        }
        if (delta?.type === 'signature_delta' && typeof delta?.signature === 'string') {
          if (Number.isFinite(index)) {
            const cached = contentBlocks.get(index);
            if (cached) {
              cached.signature = `${cached.signature ?? ''}${delta.signature}`;
              contentBlocks.set(index, cached);
            } else {
              contentBlocks.set(index, { type: 'thinking', signature: delta.signature });
            }
          }
          continue;
        }
        if (delta?.type === 'text_delta' && typeof delta?.text === 'string') {
          yield { type: 'text', content: delta.text } satisfies LLMStreamChunk;
        }
      }
    }
  }
  if (rawEvents.length > 0) {
    yield { type: 'raw_response', content: '', payload: rawEvents } satisfies LLMStreamChunk;
  }
}

async function* streamFromMock(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<LLMStreamChunk> {
  const lastUser = [...messages].reverse().find((msg) => msg.role === 'user');
  const reply = lastUser ? `Echo: ${flattenMessageContent(lastUser.content)}` : 'Ready for instructions.';
  for (const token of reply.match(/.{1,80}/g) ?? []) {
    if (signal?.aborted) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    yield { type: 'text', content: token } satisfies LLMStreamChunk;
  }
}
