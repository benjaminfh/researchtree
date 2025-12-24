import type { LLMProvider } from '@/src/shared/llmProvider';
import { isSupportedModelForProvider } from '@/src/shared/llmCapabilities';
import { getDefaultModelForProvider, resolveLLMProvider } from '@/src/server/llm';
import { getProviderEnvConfig } from '@/src/server/llmConfig';
import { getStoreConfig } from '@/src/server/storeConfig';
import { readBranchConfigMap } from '@/src/git/branchConfig';

export interface BranchConfig {
  provider: LLMProvider;
  model: string;
}

export function resolveModelForProvider(provider: LLMProvider, model?: string | null): string {
  const trimmed = (model ?? '').trim();
  if (trimmed && isSupportedModelForProvider(provider, trimmed)) {
    const allowed = getProviderEnvConfig(provider).allowedModels;
    if (!allowed || allowed.includes(trimmed)) {
      return trimmed;
    }
  }
  return getDefaultModelForProvider(provider);
}

export function resolveBranchConfig(input?: {
  provider?: string | null;
  model?: string | null;
  fallback?: BranchConfig;
}): BranchConfig {
  const fallbackProvider = input?.fallback?.provider ?? resolveLLMProvider();
  const provider = input?.provider ? resolveLLMProvider(input.provider as LLMProvider) : fallbackProvider;
  const modelCandidate =
    input?.model ?? (provider === input?.fallback?.provider ? input?.fallback?.model : undefined);
  const model = resolveModelForProvider(provider, modelCandidate);
  return { provider, model };
}

export async function getBranchConfigMap(projectId: string): Promise<Record<string, BranchConfig>> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtListRefsShadowV1 } = await import('@/src/store/pg/reads');
    const branches = await rtListRefsShadowV1({ projectId });
    const map: Record<string, BranchConfig> = {};
    for (const branch of branches) {
      map[branch.name] = resolveBranchConfig({
        provider: branch.provider ?? null,
        model: branch.model ?? null
      });
    }
    return map;
  }

  const configMap = await readBranchConfigMap(projectId);
  const map: Record<string, BranchConfig> = {};
  for (const [name, config] of Object.entries(configMap)) {
    map[name] = resolveBranchConfig({ provider: config.provider, model: config.model });
  }
  return map;
}
