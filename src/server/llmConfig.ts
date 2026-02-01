// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { LLMProvider } from '@/src/shared/llmProvider';
import { LLM_ENDPOINTS } from '@/src/shared/llmCapabilities';

export interface ProviderEnvConfig {
  enabled: boolean;
  allowedModels: string[] | null;
  defaultModel: string;
}

export type DeployEnv = 'dev' | 'prod';

export function getDeployEnv(): DeployEnv {
  const raw = (process.env.DEPLOY_ENV ?? 'dev').trim().toLowerCase();
  if (raw === 'prod' || raw === 'production') return 'prod';
  return 'dev';
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseCsvEnv(value: string | undefined): string[] | null {
  const normalized = (value ?? '').trim();
  if (!normalized) return null;
  const items = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

function isAllowedModel(allowedModels: string[] | null, model: string): boolean {
  if (!allowedModels) return true;
  return allowedModels.includes(model);
}

export function getEnabledProviders(): LLMProvider[] {
  const enabled: LLMProvider[] = [];
  const openAIEnabled = parseBooleanEnv(process.env.LLM_ENABLE_OPENAI, true);
  if (openAIEnabled) {
    enabled.push('openai');
    if (getOpenAIUseResponses()) {
      enabled.push('openai_responses');
    }
  }
  if (parseBooleanEnv(process.env.LLM_ENABLE_GEMINI, true)) enabled.push('gemini');
  if (parseBooleanEnv(process.env.LLM_ENABLE_ANTHROPIC, false)) enabled.push('anthropic');
  if (getDeployEnv() === 'dev') {
    enabled.push('mock');
  }
  return enabled;
}

export function getDefaultProvider(): LLMProvider {
  const enabled = new Set(getEnabledProviders());
  const raw = (process.env.LLM_DEFAULT_PROVIDER ?? '').trim().toLowerCase();
  const candidate = (
    raw === 'openai' ||
    raw === 'openai_responses' ||
    raw === 'gemini' ||
    raw === 'anthropic' ||
    raw === 'mock'
      ? raw
      : ''
  ) as LLMProvider | '';
  if (candidate && enabled.has(candidate)) {
    return candidate;
  }

  for (const fallback of ['openai_responses', 'openai', 'gemini', 'anthropic', 'mock'] as const) {
    if (enabled.has(fallback)) return fallback;
  }
  // Should be unreachable (dev always includes mock), but keep safe default.
  return 'mock';
}

export function getProviderEnvConfig(provider: LLMProvider): ProviderEnvConfig {
  if (provider === 'openai' || provider === 'openai_responses') {
    const enabled = parseBooleanEnv(process.env.LLM_ENABLE_OPENAI, true);
    const supportedModels = LLM_ENDPOINTS[provider].models;
    const allowedFromEnv = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_OPENAI);
    if (allowedFromEnv && allowedFromEnv.some((model) => !supportedModels.includes(model))) {
      throw new Error(
        `LLM_ALLOWED_MODELS_OPENAI must be a subset of supported models (${supportedModels.join(', ')})`
      );
    }
    const allowedModels = allowedFromEnv ?? supportedModels;
    const fallbackModel = LLM_ENDPOINTS[provider].defaultModel;
    const envModel = (process.env.OPENAI_MODEL ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(`OPENAI_MODEL must be one of LLM_ALLOWED_MODELS_OPENAI (${allowedModels?.join(', ') ?? ''})`);
    }
    return { enabled, allowedModels, defaultModel };
  }

  if (provider === 'gemini') {
    const enabled = parseBooleanEnv(process.env.LLM_ENABLE_GEMINI, true);
    const supportedModels = LLM_ENDPOINTS.gemini.models;
    const allowedFromEnv = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_GEMINI);
    if (allowedFromEnv && allowedFromEnv.some((model) => !supportedModels.includes(model))) {
      throw new Error(
        `LLM_ALLOWED_MODELS_GEMINI must be a subset of supported models (${supportedModels.join(', ')})`
      );
    }
    const allowedModels = allowedFromEnv ?? supportedModels;
    const fallbackModel = LLM_ENDPOINTS.gemini.defaultModel;
    const envModel = (process.env.GEMINI_MODEL ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(`GEMINI_MODEL must be one of LLM_ALLOWED_MODELS_GEMINI (${allowedModels?.join(', ') ?? ''})`);
    }
    return { enabled, allowedModels, defaultModel };
  }

  if (provider === 'anthropic') {
    const enabled = parseBooleanEnv(process.env.LLM_ENABLE_ANTHROPIC, false);
    const supportedModels = LLM_ENDPOINTS.anthropic.models;
    const allowedFromEnv = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_ANTHROPIC);
    if (allowedFromEnv && allowedFromEnv.some((model) => !supportedModels.includes(model))) {
      throw new Error(
        `LLM_ALLOWED_MODELS_ANTHROPIC must be a subset of supported models (${supportedModels.join(', ')})`
      );
    }
    const allowedModels = allowedFromEnv ?? supportedModels;
    const fallbackModel = LLM_ENDPOINTS.anthropic.defaultModel;
    const envModel = (process.env.ANTHROPIC_MODEL ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(
        `ANTHROPIC_MODEL must be one of LLM_ALLOWED_MODELS_ANTHROPIC (${allowedModels?.join(', ') ?? ''})`
      );
    }
    return { enabled, allowedModels, defaultModel };
  }

  return { enabled: true, allowedModels: null, defaultModel: 'mock' };
}

export function getOpenAIUseResponses(): boolean {
  return parseBooleanEnv(process.env.OPENAI_USE_RESPONSES, true);
}
