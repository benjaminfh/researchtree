import type { LLMProvider } from '@/src/shared/llmProvider';
import { getEnabledProviders } from '@/src/server/llmConfig';
import { resolveLLMProvider, resolveOpenAIProviderSelection } from '@/src/server/llm';

export async function getUserDefaultProviderPreference(): Promise<LLMProvider | null> {
  const { rtGetUserLlmKeyStatusV1 } = await import('@/src/store/pg/userLlmKeys');
  const status = await rtGetUserLlmKeyStatusV1();
  return status.defaultProvider ?? null;
}

export async function resolveCreationProvider(requestedProvider?: LLMProvider | null): Promise<LLMProvider> {
  if (requestedProvider) {
    return resolveOpenAIProviderSelection(requestedProvider);
  }

  const preferred = await getUserDefaultProviderPreference();
  if (preferred && getEnabledProviders().includes(preferred)) {
    return resolveLLMProvider(preferred);
  }

  return resolveLLMProvider();
}
