import type { LLMProvider } from '@/src/server/llm';

export interface ModelCapabilities {
  supportsThinking: boolean;
  supportsWebSearch: boolean;
  supportsStreaming: boolean;
}

const DEFAULT_CAPS: ModelCapabilities = {
  supportsThinking: false,
  supportsWebSearch: false,
  supportsStreaming: true
};

export function getModelCapabilities(provider: LLMProvider, model: string): ModelCapabilities {
  const normalized = model.toLowerCase();

  if (provider === 'openai') {
    // We use a best-effort reasoning_effort parameter and retry without it on failure.
    return {
      supportsThinking: true,
      supportsWebSearch: false,
      supportsStreaming: true
    };
  }

  if (provider === 'gemini') {
    const isGemini3 = normalized.includes('gemini-3');
    const isGemini25 = normalized.includes('gemini-2.5');
    return {
      supportsThinking: isGemini3 || isGemini25,
      supportsWebSearch: true,
      supportsStreaming: true
    };
  }

  if (provider === 'anthropic') {
    return {
      supportsThinking: true,
      supportsWebSearch: false,
      supportsStreaming: true
    };
  }

  return DEFAULT_CAPS;
}

