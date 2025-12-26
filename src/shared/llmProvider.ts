export const LLM_PROVIDERS = ['openai', 'openai_responses', 'gemini', 'anthropic', 'mock'] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];
