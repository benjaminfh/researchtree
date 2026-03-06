// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { LLMProvider } from '@/src/shared/llmProvider';
import { isSupportedModelForProvider } from '@/src/shared/llmCapabilities';
import { getDefaultModelForProvider, resolveLLMProvider, resolveOpenAIProviderSelection } from '@/src/server/llm';
import { getProviderEnvConfig } from '@/src/server/llmConfig';
import { getStoreConfig } from '@/src/server/storeConfig';
import { readBranchConfigMap } from '@/src/git/branchConfig';

export interface BranchConfig {
  provider: LLMProvider;
  model: string;
}

export interface BranchCreationConfig extends BranchConfig {
  sourceProvider: LLMProvider | null;
}

const VALID_PROVIDERS = new Set<LLMProvider>(['openai', 'openai_responses', 'gemini', 'anthropic', 'mock']);

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
  const rawProvider = input?.provider?.trim();
  const providerCandidate = rawProvider ? rawProvider.toLowerCase() : '';
  if (providerCandidate && !VALID_PROVIDERS.has(providerCandidate as LLMProvider)) {
    throw new Error(
      `Invalid branch provider "${input?.provider}". Expected one of: ${Array.from(VALID_PROVIDERS).join(', ')}.`
    );
  }
  const provider = providerCandidate ? (providerCandidate as LLMProvider) : fallbackProvider;
  const modelCandidate =
    input?.model ?? (provider === input?.fallback?.provider ? input?.fallback?.model : undefined);
  const model = resolveModelForProvider(provider, modelCandidate);
  return { provider, model };
}

export function resolveBranchCreationConfig(input?: {
  sourceProvider?: string | null;
  sourceModel?: string | null;
  requestedProvider?: string | null;
  requestedModel?: string | null;
}): BranchCreationConfig {
  const sourceProviderRaw = input?.sourceProvider?.trim() ?? '';
  const sourceModel = input?.sourceModel ?? null;
  const requestedProviderRaw = input?.requestedProvider?.trim() ?? '';
  const requestedModel = input?.requestedModel ?? null;

  let sourceConfig: BranchConfig | null = null;
  if (sourceProviderRaw) {
    try {
      const normalizedSource = resolveBranchConfig({
        provider: sourceProviderRaw,
        model: sourceModel
      });
      sourceConfig = {
        provider: resolveLLMProvider(normalizedSource.provider),
        model: normalizedSource.model
      };
    } catch {
      sourceConfig = null;
    }
  }

  if (requestedProviderRaw) {
    const provider = resolveOpenAIProviderSelection(requestedProviderRaw as LLMProvider);
    const config = resolveBranchConfig({
      provider,
      model: requestedModel
    });
    return {
      provider: config.provider,
      model: config.model,
      sourceProvider: sourceConfig?.provider ?? null
    };
  }

  const fallbackProvider = sourceConfig?.provider ?? resolveOpenAIProviderSelection();
  const config = resolveBranchConfig({
    provider: fallbackProvider,
    model: requestedModel ?? sourceConfig?.model ?? null,
    fallback: sourceConfig ?? undefined
  });
  return {
    provider: config.provider,
    model: config.model,
    sourceProvider: sourceConfig?.provider ?? null
  };
}

export async function getBranchConfigMap(projectId: string): Promise<Record<string, BranchConfig>> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
    const branches = await rtListRefsShadowV2({ projectId });
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
