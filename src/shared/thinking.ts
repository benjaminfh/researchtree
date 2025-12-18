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

export function toGeminiModelThinking(setting: ThinkingSetting): { systemInstruction?: string } {
  const instruction = getThinkingSystemInstruction(setting);
  return instruction ? { systemInstruction: instruction } : {};
}

export function getThinkingSystemInstruction(setting?: ThinkingSetting): string | null {
  if (!setting || setting === 'medium') {
    return null;
  }

  if (setting === 'off') {
    return [
      'Thinking mode: Off.',
      'Answer directly and do not add extra analysis beyond what is needed for correctness.'
    ].join('\n');
  }

  if (setting === 'low') {
    return ['Thinking mode: Low.', 'Keep responses concise; only include essential reasoning.'].join('\n');
  }

  return [
    'Thinking mode: High.',
    'Take extra time to analyze the request and cover important edge cases.',
    'Provide a structured answer with rationale and tradeoffs, but keep it readable.'
  ].join('\n');
}

export function translateThinkingForProvider(provider: ThinkingProvider, setting: ThinkingSetting) {
  if (provider === 'openai') {
    return { provider, setting, openaiReasoningEffort: toOpenAIReasoningEffort(setting) };
  }
  if (provider === 'gemini') {
    return { provider, setting, geminiSystemInstruction: getThinkingSystemInstruction(setting) };
  }
  if (provider === 'anthropic') {
    return { provider, setting, anthropicThinking: toAnthropicThinking(setting) };
  }
  return { provider, setting, openaiReasoningEffort: null };
}
