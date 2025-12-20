import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { type LLMProvider, resolveLLMProvider, getDefaultModelForProvider } from './llm';

const DEFAULT_LIMITS: Record<LLMProvider, number> = {
  openai: 128_000,
  gemini: 200_000,
  anthropic: 200_000,
  mock: 8_000
};

const SAFETY_RATIO = 0.5;
const MIN_LIMIT = 2_000;

const cache = new Map<string, number>();

let cachedOpenAIClient: OpenAI | null = null;
let cachedGeminiClient: GoogleGenerativeAI | null = null;
let warmupPromise: Promise<void> | null = null;

export async function getProviderTokenLimit(provider?: LLMProvider, modelOverride?: string): Promise<number> {
  await warmProviderCapabilities();
  const resolved = resolveLLMProvider(provider);
  const model = modelOverride ?? getDefaultModelForProvider(resolved);
  const cacheKey = `${resolved}:${model}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  let limit = DEFAULT_LIMITS[resolved] ?? DEFAULT_LIMITS.mock;

  if (resolved === 'openai') {
    const fetched = await fetchOpenAIContextLimit(model);
    if (typeof fetched === 'number') {
      limit = fetched;
    }
  } else if (resolved === 'gemini') {
    const fetched = await fetchGeminiContextLimit(model);
    if (typeof fetched === 'number') {
      limit = fetched;
    }
  }

  const safeLimit = Math.max(Math.floor(limit * SAFETY_RATIO), MIN_LIMIT);
  cache.set(cacheKey, safeLimit);
  return safeLimit;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!cachedOpenAIClient) {
    cachedOpenAIClient = new OpenAI({ apiKey });
  }
  return cachedOpenAIClient;
}

function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!cachedGeminiClient) {
    cachedGeminiClient = new GoogleGenerativeAI(apiKey);
  }
  return cachedGeminiClient;
}

async function fetchOpenAIContextLimit(model: string): Promise<number | null> {
  const client = getOpenAIClient();
  if (!client) {
    return null;
  }
  try {
    const info = await client.models.retrieve(model);
    const candidate =
      (info as any).context_length ??
      (info as any).input_token_limit ??
      (info as any).max_context_length ??
      (info as any).max_tokens ??
      null;
    return typeof candidate === 'number' ? candidate : null;
  } catch (error) {
    console.warn('[LLM] Unable to fetch OpenAI model info', error);
    return null;
  }
}

async function fetchGeminiContextLimit(model: string): Promise<number | null> {
  const client = getGeminiClient();
  if (!client) {
    return null;
  }

  try {
    const getModel = (client as any)?.models?.getModel?.bind((client as any).models);
    if (!getModel) {
      return null;
    }
    const identifier = model.startsWith('models/') ? model : `models/${model}`;
    const info = await getModel(identifier);
    const candidate = (info as any).inputTokenLimit ?? (info as any).input_token_limit ?? null;
    return typeof candidate === 'number' ? candidate : null;
  } catch (error) {
    console.warn('[LLM] Unable to fetch Gemini model info', error);
    return null;
  }
}

export function __resetProviderCapabilitiesCache(): void {
  cache.clear();
  cachedOpenAIClient = null;
  cachedGeminiClient = null;
  warmupPromise = null;
}

export function warmProviderCapabilities(): Promise<void> {
  if (warmupPromise) {
    return warmupPromise;
  }

  warmupPromise = (async () => {
    const tasks: Promise<void>[] = [];

    if (process.env.OPENAI_API_KEY) {
      tasks.push(
        (async () => {
          const limit = await fetchOpenAIContextLimit(getDefaultModelForProvider('openai'));
          if (limit) {
            cache.set(`openai:${getDefaultModelForProvider('openai')}`, Math.max(Math.floor(limit * SAFETY_RATIO), MIN_LIMIT));
          }
        })()
      );
    }

    if (process.env.GEMINI_API_KEY) {
      tasks.push(
        (async () => {
          const limit = await fetchGeminiContextLimit(getDefaultModelForProvider('gemini'));
          if (limit) {
            cache.set(`gemini:${getDefaultModelForProvider('gemini')}`, Math.max(Math.floor(limit * SAFETY_RATIO), MIN_LIMIT));
          }
        })()
      );
    }

    await Promise.allSettled(tasks);
  })();

  return warmupPromise;
}

// Kick off warmup eagerly, ignoring failures (will fall back to defaults later)
void warmProviderCapabilities().catch((error) => {
  console.warn('[LLM] Warmup failed, using default token limits', error);
});
