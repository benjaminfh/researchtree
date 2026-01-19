// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import type { LLMProvider } from '@/src/shared/llmProvider';
import { isSupportedModelForProvider } from '@/src/shared/llmCapabilities';
import { getDefaultModelForProvider, resolveOpenAIProviderSelection } from '@/src/server/llm';
import { getProviderEnvConfig } from '@/src/server/llmConfig';
import { getStoreConfig } from '@/src/server/storeConfig';
import { readBranchConfigMap } from '@/src/git/branchConfig';
import { ensureBranchIds, getBranchNameByIdMap } from '@/src/git/branchIds';

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
  const fallbackProvider = input?.fallback?.provider ?? resolveOpenAIProviderSelection();
  const provider = input?.provider ? (input.provider as LLMProvider) : fallbackProvider;
  const modelCandidate =
    input?.model ?? (provider === input?.fallback?.provider ? input?.fallback?.model : undefined);
  const model = resolveModelForProvider(provider, modelCandidate);
  return { provider, model };
}

export async function getBranchConfigMap(projectId: string): Promise<Record<string, BranchConfig>> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
    const branches = await rtListRefsShadowV2({ projectId });
    const map: Record<string, BranchConfig> = {};
    for (const branch of branches) {
      map[branch.id] = resolveBranchConfig({
        provider: branch.provider ?? null,
        model: branch.model ?? null
      });
    }
    return map;
  }

  const configMap = await readBranchConfigMap(projectId);
  const nameById = await getBranchNameByIdMap(projectId);
  const existingNames = new Set(Object.values(nameById));
  const missingNames = Object.keys(configMap).filter((name) => !existingNames.has(name));
  if (missingNames.length > 0) {
    await ensureBranchIds(projectId, missingNames);
  }
  const updatedNameById = await getBranchNameByIdMap(projectId);
  const idByName = new Map(Object.entries(updatedNameById).map(([id, name]) => [name, id]));
  const map: Record<string, BranchConfig> = {};
  for (const [name, config] of Object.entries(configMap)) {
    const id = idByName.get(name);
    if (!id) continue;
    map[id] = resolveBranchConfig({ provider: config.provider, model: config.model });
  }
  return map;
}
