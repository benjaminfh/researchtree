export const LLM_PROVIDERS = ['openai', 'gemini', 'anthropic', 'mock'] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

