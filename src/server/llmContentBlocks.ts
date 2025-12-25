import type { LLMProvider } from '@/src/shared/llmProvider';
import { stripThinkingTextIfSignature, type ThinkingContentBlock } from '@/src/shared/thinkingTraces';

type AnthropicEvent = { event: string | null; data: string };

function toTextBlock(text: string): ThinkingContentBlock[] {
  return text ? [{ type: 'text', text }] : [];
}

function extractOpenAIResponsesDelta(event: any): string | null {
  if (!event || typeof event !== 'object') return null;
  if (event.type !== 'response.output_text.delta') return null;
  if (typeof event.delta === 'string') return event.delta;
  if (typeof event.text === 'string') return event.text;
  if (typeof event.delta?.text === 'string') return event.delta.text;
  return null;
}

function buildOpenAIBlocksFromRaw(rawResponse: unknown): ThinkingContentBlock[] {
  const parts = Array.isArray(rawResponse)
    ? rawResponse
    : Array.isArray((rawResponse as any)?.events)
      ? (rawResponse as any).events
      : [];
  let text = '';

  const hasResponsesEvents = parts.some(
    (part: unknown) => typeof (part as any)?.type === 'string' && String((part as any).type).startsWith('response.')
  );
  if (hasResponsesEvents) {
    for (const event of parts) {
      const delta = extractOpenAIResponsesDelta(event);
      if (delta) {
        text += delta;
      }
    }
    return toTextBlock(text);
  }

  for (const part of parts) {
    const delta = (part as any)?.choices?.[0]?.delta;
    const content = delta?.content;
    if (typeof content === 'string') {
      text += content;
      continue;
    }
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          text += block.text;
        }
      }
    }
  }
  return toTextBlock(text);
}

function buildGeminiBlocks(rawResponse: unknown): ThinkingContentBlock[] {
  const response = (rawResponse as any)?.response ?? rawResponse;
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];

  const blocks: ThinkingContentBlock[] = [];
  for (const part of parts) {
    const text = typeof part?.text === 'string' ? String(part.text) : '';
    if (text) {
      if (part?.thought === true) {
        blocks.push({ type: 'thinking', thinking: text });
      } else {
        blocks.push({ type: 'text', text });
      }
    }
    const signature = typeof part?.thoughtSignature === 'string' ? String(part.thoughtSignature) : '';
    if (signature) {
      blocks.push({ type: 'thinking_signature', signature });
    }
  }
  return blocks;
}

function buildAnthropicBlocks(rawEvents: AnthropicEvent[]): ThinkingContentBlock[] {
  const blocks: ThinkingContentBlock[] = [];
  const inFlight = new Map<
    number,
    { type: string; thinking: string; text: string; signature?: string; inputJson?: string; raw?: Record<string, unknown> }
  >();

  for (const evt of rawEvents) {
    if (!evt?.data) continue;
    let parsed: any = null;
    try {
      parsed = JSON.parse(evt.data);
    } catch {
      continue;
    }
    if (!parsed) continue;

    if (evt.event === 'content_block_start') {
      const index = Number(parsed.index);
      if (!Number.isFinite(index)) continue;
      const contentBlock = parsed.content_block ?? {};
      const type = String(contentBlock.type ?? '');
      inFlight.set(index, {
        type,
        thinking: typeof contentBlock.thinking === 'string' ? contentBlock.thinking : '',
        text: typeof contentBlock.text === 'string' ? contentBlock.text : '',
        signature: typeof contentBlock.signature === 'string' ? contentBlock.signature : undefined,
        raw: contentBlock && typeof contentBlock === 'object' ? contentBlock : undefined
      });
      continue;
    }

    if (evt.event === 'content_block_delta') {
      const index = Number(parsed.index);
      if (!Number.isFinite(index)) continue;
      const state = inFlight.get(index);
      if (!state) continue;
      const delta = parsed.delta ?? {};
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        state.thinking += delta.thinking;
      } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        state.text += delta.text;
      } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
        state.signature = `${state.signature ?? ''}${delta.signature}`;
      } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        state.inputJson = `${state.inputJson ?? ''}${delta.partial_json}`;
      }
      continue;
    }

    if (evt.event === 'content_block_stop') {
      const index = Number(parsed.index);
      if (!Number.isFinite(index)) continue;
      const state = inFlight.get(index);
      if (!state) continue;
      if (state.type === 'thinking') {
        const block: ThinkingContentBlock = { type: 'thinking', thinking: state.thinking };
        if (state.signature) {
          block.signature = state.signature;
        }
        blocks.push(block);
      } else if (state.type === 'text') {
        blocks.push({ type: 'text', text: state.text });
      } else if (state.type === 'tool_use') {
        const raw = { ...(state.raw ?? {}) } as Record<string, unknown>;
        if (state.inputJson) {
          try {
            raw.input = JSON.parse(state.inputJson);
          } catch {
            raw.input = state.inputJson;
          }
        }
        blocks.push({ type: state.type, ...raw });
      } else {
        blocks.push({ type: state.type, ...(state.raw ?? {}) });
      }
      inFlight.delete(index);
    }
  }

  return blocks;
}

export function buildRawContentBlocksForProvider(options: {
  provider: LLMProvider;
  rawResponse: unknown;
  fallbackText?: string;
  fallbackBlocks?: ThinkingContentBlock[];
}): ThinkingContentBlock[] {
  const { provider, rawResponse, fallbackText, fallbackBlocks } = options;
  let blocks: ThinkingContentBlock[] = [];

  if (provider === 'gemini') {
    blocks = buildGeminiBlocks(rawResponse);
  } else if (provider === 'anthropic') {
    blocks = buildAnthropicBlocks(Array.isArray(rawResponse) ? (rawResponse as AnthropicEvent[]) : []);
  } else if (provider === 'openai' || provider === 'openai_responses') {
    blocks = buildOpenAIBlocksFromRaw(rawResponse);
  } else {
    blocks = buildOpenAIBlocksFromRaw(rawResponse);
  }

  if (blocks.length === 0 && Array.isArray(fallbackBlocks) && fallbackBlocks.length > 0) {
    return fallbackBlocks;
  }
  if (blocks.length === 0 && fallbackText) {
    return toTextBlock(fallbackText);
  }
  return blocks;
}

export function buildContentBlocksForProvider(options: {
  provider: LLMProvider;
  rawResponse: unknown;
  fallbackText?: string;
  fallbackBlocks?: ThinkingContentBlock[];
}): ThinkingContentBlock[] {
  return buildRawContentBlocksForProvider(options);
}

export function buildContextBlocksFromRaw(options: {
  provider: LLMProvider;
  rawResponse: unknown;
  fallbackText?: string;
  fallbackBlocks?: ThinkingContentBlock[];
}): ThinkingContentBlock[] {
  const rawBlocks = buildRawContentBlocksForProvider(options);
  if (options.provider === 'gemini') {
    return rawBlocks.filter((block) => block.type !== 'thinking');
  }
  if (options.provider === 'anthropic') {
    return stripThinkingTextIfSignature(rawBlocks);
  }
  return rawBlocks;
}

export function buildTextBlock(text: string): ThinkingContentBlock[] {
  return toTextBlock(text);
}
