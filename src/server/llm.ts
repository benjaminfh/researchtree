import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatMessage } from './context';
import { toOpenAIReasoningEffort, type ThinkingSetting } from '@/src/shared/thinking';

export type LLMProvider = 'openai' | 'gemini' | 'mock';

export interface LLMStreamChunk {
  type: 'text';
  content: string;
}

export interface LLMStreamOptions {
  messages: ChatMessage[];
  signal?: AbortSignal;
  provider?: LLMProvider;
  thinking?: ThinkingSetting;
}

const encoder = new TextEncoder();

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.2';
const DEFAULT_GEMINI_MODEL = 'gemini-3-pro-preview';

let openAIClient: OpenAI | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

export function resolveLLMProvider(requested?: LLMProvider): LLMProvider {
  if (requested) {
    return requested;
  }
  const env = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  if (env === 'openai' || env === 'gemini') {
    return env;
  }
  return 'mock';
}

export function getDefaultModelForProvider(provider: LLMProvider): string {
  if (provider === 'gemini') {
    return DEFAULT_GEMINI_MODEL;
  }
  if (provider === 'openai') {
    return DEFAULT_OPENAI_MODEL;
  }
  return 'mock';
}

export async function* streamAssistantCompletion({
  messages,
  signal,
  provider,
  thinking
}: LLMStreamOptions): AsyncGenerator<LLMStreamChunk> {
  const resolvedProvider = resolveLLMProvider(provider);

  if (resolvedProvider === 'openai') {
    yield* streamFromOpenAI(messages, signal, thinking);
    return;
  }

  if (resolvedProvider === 'gemini') {
    yield* streamFromGemini(messages, signal, thinking);
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
  thinking?: ThinkingSetting
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[LLM] Missing OPENAI_API_KEY, using mock provider instead.');
    yield* streamFromMock(messages, signal);
    return;
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({ apiKey });
  }

  const formattedMessages = messages.map((message) => ({
    role: message.role,
    content: message.content
  })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  const reasoningEffort = thinking ? toOpenAIReasoningEffort(thinking) : null;
  const baseRequest = {
    model: DEFAULT_OPENAI_MODEL,
    messages: formattedMessages,
    temperature: 0.2,
    stream: true
  } as const;

  let stream: any;
  try {
    stream = await openAIClient.chat.completions.create({
      ...baseRequest,
      ...(reasoningEffort ? ({ reasoning_effort: reasoningEffort } as any) : null)
    } as any);
  } catch (error) {
    if (reasoningEffort) {
      stream = await openAIClient.chat.completions.create(baseRequest as any);
    } else {
      throw error;
    }
  }

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
  thinking?: ThinkingSetting
): AsyncGenerator<LLMStreamChunk> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[LLM] Missing GEMINI_API_KEY, using mock provider instead.');
    yield* streamFromMock(messages, signal);
    return;
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(apiKey);
  }

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
    geminiClient!.getGenerativeModel(systemInstruction ? { model: modelName, systemInstruction } : { model: modelName });

  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const model = pickModel(modelName);
  let stream: any;
  stream = await model.generateContentStream({ contents } as any);

  for await (const chunk of stream.stream) {
    if (signal?.aborted) {
      break;
    }
    const text = chunk.text();
    if (text) {
      yield { type: 'text', content: text } satisfies LLMStreamChunk;
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
