import type { ThinkingSetting } from '@/src/shared/thinking';
import { toGemini25ThinkingBudget, toOpenAIReasoningEffort } from '@/src/shared/thinking';
import type { LLMProvider } from '@/src/shared/llmProvider';

export { LLM_PROVIDERS, type LLMProvider } from '@/src/shared/llmProvider';

export interface ProviderEndpointConfig {
  defaultModel: string;
  models: string[];
}

export const LLM_ENDPOINTS: Record<LLMProvider, ProviderEndpointConfig> = {
  openai: {
    defaultModel: 'gpt-5.2',
    models: ['gpt-5.2', 'gpt-5.1', 'gpt-4o-mini-search-preview', 'gpt-4o-search-preview']
  },
  openai_responses: {
    defaultModel: 'gpt-5.2',
    models: ['gpt-5.2', 'gpt-5.1']
  },
  gemini: {
    defaultModel: 'gemini-3-pro-preview',
    models: ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash']
  },
  anthropic: {
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5']
  },
  mock: {
    defaultModel: 'mock',
    models: ['mock']
  }
};

export function getDefaultModelForProviderFromCapabilities(provider: LLMProvider): string {
  return LLM_ENDPOINTS[provider].defaultModel;
}

export function isSupportedModelForProvider(provider: LLMProvider, modelName: string): boolean {
  const normalized = modelName.trim();
  if (!normalized) return false;
  return LLM_ENDPOINTS[provider].models.includes(normalized);
}

export interface ThinkingValidationResult {
  ok: boolean;
  allowed: ThinkingSetting[];
  message?: string;
}

export function getAllowedThinkingSettings(provider: LLMProvider, modelName: string): ThinkingSetting[] {
  if (provider === 'mock') return ['off', 'low', 'medium', 'high'];

  if (provider === 'openai' || provider === 'openai_responses') return ['off', 'low', 'medium', 'high'];
  if (provider === 'anthropic') return ['off', 'low', 'medium', 'high'];

  if (provider === 'gemini') {
    const normalized = modelName.toLowerCase();
    const isGemini3 = /(^|\/)gemini-3/i.test(normalized);
    const isFlash = /flash/i.test(normalized);
    if (isGemini3) {
      // Gemini 3 Pro supports only low/high; Gemini 3 Flash supports minimal/low/medium/high.
      // Our UI does not expose "minimal" yet, so we only enable the overlap.
      return isFlash ? (['low', 'medium', 'high'] as const) : (['low', 'high'] as const);
    }
    // Gemini 2.5 and below uses thinkingBudget; allow off and all UI levels.
    return ['off', 'low', 'medium', 'high'];
  }

  return ['off', 'low', 'medium', 'high'];
}

export function validateThinkingSetting(
  provider: LLMProvider,
  modelName: string,
  thinking: ThinkingSetting | undefined
): ThinkingValidationResult {
  const allowed = getAllowedThinkingSettings(provider, modelName);
  const requested = thinking ?? 'off';
  if (allowed.includes(requested)) {
    return { ok: true, allowed };
  }

  const providerLabel =
    provider === 'openai' || provider === 'openai_responses'
      ? 'OpenAI'
      : provider === 'gemini'
        ? 'Gemini'
        : provider === 'anthropic'
          ? 'Anthropic'
          : 'Mock';
  return {
    ok: false,
    allowed,
    message: `${providerLabel} model ${modelName} does not support Thinking: ${requested}. Allowed: ${allowed
      .map((s) => s[0]!.toUpperCase() + s.slice(1))
      .join(', ')}.`
  };
}

export function getDefaultThinkingSetting(provider: LLMProvider, modelName: string): ThinkingSetting {
  const allowed = getAllowedThinkingSettings(provider, modelName);
  if (allowed.includes('medium')) return 'medium';
  if (allowed.includes('low')) return 'low';
  return allowed[0] ?? 'off';
}

export function buildOpenAIThinkingParams(thinking: ThinkingSetting | undefined): { reasoning_effort?: string } {
  const effort = thinking ? toOpenAIReasoningEffort(thinking) : null;
  return effort ? ({ reasoning_effort: effort } as any) : {};
}

export function buildOpenAIResponsesThinkingParams(
  thinking: ThinkingSetting | undefined
): { reasoning?: { effort: string } } {
  const effort = thinking ? toOpenAIReasoningEffort(thinking) : null;
  return effort ? ({ reasoning: { effort } } as any) : {};
}

export function buildGeminiThinkingParams(
  modelName: string,
  thinking: ThinkingSetting | undefined
): { generationConfig?: { thinkingConfig: Record<string, unknown> } } {
  const normalized = modelName.toLowerCase();
  const isGemini3 = /(^|\/)gemini-3/i.test(normalized);
  const requested = thinking ?? 'off';
  const validation = validateThinkingSetting('gemini', modelName, requested);
  if (!validation.ok) {
    throw new Error(validation.message ?? 'Invalid Gemini thinking setting');
  }

  if (isGemini3) {
    // No "off" or "minimal" in current UI; requested is low|medium|high (or low|high for Pro).
    return { generationConfig: { thinkingConfig: { thinkingLevel: requested } } };
  }

  // Gemini 2.5 and below: translate into thinkingBudget; off maps to 0.
  return { generationConfig: { thinkingConfig: { thinkingBudget: toGemini25ThinkingBudget(requested) } } };
}

export function getAnthropicMaxOutputTokens(modelName: string): number | null {
  const normalized = modelName.trim().toLowerCase();
  if (!normalized) return null;
  // Confirmed: Claude v4.5 models support up to 64k output tokens.
  if (normalized === 'claude-opus-4-5' || normalized === 'claude-sonnet-4-5') return 64_000;
  return null;
}
