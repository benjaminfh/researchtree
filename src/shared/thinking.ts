import type { LLMProvider } from '@/src/server/llm';

export const THINKING_SETTINGS = ['off', 'low', 'medium', 'high'] as const;

export type ThinkingSetting = (typeof THINKING_SETTINGS)[number];

export const THINKING_SETTING_LABELS: Record<ThinkingSetting, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High'
};

export type ThinkingProvider = LLMProvider | 'anthropic';

export type OpenAIReasoningEffort = 'low' | 'medium' | 'high';

// Gemini thinking configuration options.
//
// Gemini 3 supports thinking "levels" (e.g. "low"):
//   config.thinking_config.thinking_level = "low" | "medium" | "high"
//
// Gemini 2.5 and below supports thinking "budgets":
//   config.thinking_config.thinking_budget = 0 (off) | -1 (dynamic) | [1..N] tokens
// (Budget ranges depend on model; see provider docs.)
export const GEMINI_3_THINKING_LEVELS = ['minimal', 'low', 'medium', 'high'] as const;
export type Gemini3ThinkingLevel = (typeof GEMINI_3_THINKING_LEVELS)[number];

export const GEMINI_THINKING_BUDGET_SPECIALS = {
  off: 0,
  dynamic: -1
} as const;
export type GeminiThinkingBudget = number;

export type AnthropicThinkingParam =
  | { type: 'disabled' }
  | { type: 'enabled'; budget_tokens: number };

export function toOpenAIReasoningEffort(setting: ThinkingSetting): OpenAIReasoningEffort | null {
  if (setting === 'off') return null;
  return setting;
}

export function toOpenAIChatCompletionsThinking(setting: ThinkingSetting): { reasoning_effort?: OpenAIReasoningEffort } {
  const effort = toOpenAIReasoningEffort(setting);
  return effort ? { reasoning_effort: effort } : {};
}

export function toGemini3ThinkingLevel(setting: ThinkingSetting): Gemini3ThinkingLevel | null {
  if (setting === 'off') return null;
  return setting === 'low' || setting === 'high' ? setting : 'medium';
}

export function toGemini25ThinkingBudget(setting: ThinkingSetting): GeminiThinkingBudget {
  if (setting === 'off') return GEMINI_THINKING_BUDGET_SPECIALS.off;
  if (setting === 'low') return 1024;
  if (setting === 'high') return 8192;
  return 4096;
}

export function toAnthropicThinking(setting: ThinkingSetting): AnthropicThinkingParam {
  if (setting === 'off') return { type: 'disabled' };
  const budgetBySetting: Record<Exclude<ThinkingSetting, 'off'>, number> = {
    low: 1_024,
    medium: 4_096,
    high: 8_192
  };
  return { type: 'enabled', budget_tokens: budgetBySetting[setting] };
}

export function toAnthropicMessagesThinking(setting: ThinkingSetting): { thinking: AnthropicThinkingParam } {
  return { thinking: toAnthropicThinking(setting) };
}

export function translateThinkingForProvider(provider: ThinkingProvider, setting: ThinkingSetting) {
  if (provider === 'openai') {
    return { provider, setting, openaiReasoningEffort: toOpenAIReasoningEffort(setting) };
  }
  if (provider === 'gemini') {
    return {
      provider,
      setting,
      gemini3ThinkingLevel: toGemini3ThinkingLevel(setting),
      gemini25ThinkingBudget: toGemini25ThinkingBudget(setting)
    };
  }
  if (provider === 'anthropic') {
    return { provider, setting, anthropicThinking: toAnthropicThinking(setting) };
  }
  return { provider, setting, openaiReasoningEffort: null };
}
