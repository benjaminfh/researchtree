// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { LLMProvider } from '@/src/shared/llmProvider';
import { LLM_PROVIDER_CAPABILITIES } from '@/src/shared/llmCapabilities';

export interface ProviderEnvConfig {
  enabled: boolean;
  allowedModels: string[] | null;
  defaultModel: string;
}

export type DeployEnv = 'dev' | 'prod';

const PROVIDER_CAPABILITIES_PATH = 'src/shared/llmCapabilities.ts';
const LEGACY_OPENAI_ENV_VARS = ['OPENAI_MODEL', 'LLM_ALLOWED_MODELS_OPENAI'] as const;
const LEGACY_PROVIDER_TOGGLE_ENV_VARS = [
  'LLM_ENABLE_OPENAI',
  'LLM_ENABLE_GEMINI',
  'LLM_ENABLE_ANTHROPIC',
  'OPENAI_USE_RESPONSES'
] as const;
const VALID_PROVIDERS = new Set<LLMProvider>(['openai', 'openai_responses', 'gemini', 'anthropic', 'mock']);

function buildAllowlistSubsetError(envVarName: string, supportedModels: string[]): string {
  return `${envVarName} must be a subset of code-defined provider capabilities in ${PROVIDER_CAPABILITIES_PATH} (${supportedModels.join(', ')})`;
}

export function getDeployEnv(): DeployEnv {
  const raw = (process.env.DEPLOY_ENV ?? 'dev').trim().toLowerCase();
  if (raw === 'prod' || raw === 'production') return 'prod';
  return 'dev';
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

function assertNoLegacyOpenAIEnvVars(): void {
  const configuredLegacy = LEGACY_OPENAI_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
  if (configuredLegacy.length === 0) return;
  throw new Error(
    `Legacy OpenAI env vars are no longer supported: ${configuredLegacy.join(
      ', '
    )}. Use OPENAI_CHATCOMPLETIONS_MODEL and LLM_ALLOWED_MODELS_OPENAI_CHATCOMPLETIONS instead.`
  );
}

function assertNoLegacyProviderToggleEnvVars(): void {
  const configuredLegacy = LEGACY_PROVIDER_TOGGLE_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
  if (configuredLegacy.length === 0) return;
  throw new Error(
    `Legacy provider toggle env vars are no longer supported: ${configuredLegacy.join(
      ', '
    )}. Use LLM_ENABLED_PROVIDERS instead.`
  );
}

function parseEnabledProvidersEnv(): LLMProvider[] | null {
  const values = parseCsvEnv(process.env.LLM_ENABLED_PROVIDERS);
  if (!values) return null;
  const providers: LLMProvider[] = [];
  const seen = new Set<LLMProvider>();
  for (const value of values) {
    const candidate = value.trim().toLowerCase() as LLMProvider;
    if (!VALID_PROVIDERS.has(candidate)) {
      throw new Error(
        `LLM_ENABLED_PROVIDERS contains invalid provider "${value}". Allowed: ${Array.from(VALID_PROVIDERS).join(', ')}.`
      );
    }
    if (!seen.has(candidate)) {
      seen.add(candidate);
      providers.push(candidate);
    }
  }
  return providers;
}

export function getEnabledProviders(): LLMProvider[] {
  assertNoLegacyOpenAIEnvVars();
  assertNoLegacyProviderToggleEnvVars();
  const explicit = parseEnabledProvidersEnv();
  if (explicit) {
    if (getDeployEnv() === 'prod' && explicit.includes('mock')) {
      throw new Error('LLM_ENABLED_PROVIDERS cannot include mock in prod.');
    }
    return explicit;
  }
  return getDeployEnv() === 'dev' ? ['openai_responses', 'gemini', 'mock'] : ['openai_responses', 'gemini'];
}

export function getDefaultProvider(): LLMProvider {
  assertNoLegacyOpenAIEnvVars();
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

  for (const provider of getEnabledProviders()) {
    if (enabled.has(provider)) return provider;
  }
  // Should be unreachable (dev always includes mock), but keep safe default.
  return 'mock';
}

export function getProviderEnvConfig(provider: LLMProvider): ProviderEnvConfig {
  assertNoLegacyOpenAIEnvVars();
  assertNoLegacyProviderToggleEnvVars();
  const enabledProviders = new Set(getEnabledProviders());
  if (provider === 'openai' || provider === 'openai_responses') {
    const enabled = enabledProviders.has(provider);
    const supportedModels = LLM_PROVIDER_CAPABILITIES[provider].models;
    const allowlistEnvName =
      provider === 'openai'
        ? 'LLM_ALLOWED_MODELS_OPENAI_CHATCOMPLETIONS'
        : 'LLM_ALLOWED_MODELS_OPENAI_RESPONSES';
    const modelEnvName =
      provider === 'openai' ? 'OPENAI_CHATCOMPLETIONS_MODEL' : 'OPENAI_RESPONSES_MODEL';
    const allowedFromEnv = parseCsvEnv(process.env[allowlistEnvName]);
    if (allowedFromEnv && allowedFromEnv.some((model) => !supportedModels.includes(model))) {
      throw new Error(
        buildAllowlistSubsetError(allowlistEnvName, supportedModels)
      );
    }
    const allowedModels = allowedFromEnv ?? supportedModels;
    const fallbackModel = LLM_PROVIDER_CAPABILITIES[provider].defaultModel;
    const envModel = (process.env[modelEnvName] ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(`${modelEnvName} must be one of the allowed ${provider} models (${allowedModels?.join(', ') ?? ''})`);
    }
    return { enabled, allowedModels, defaultModel };
  }

  if (provider === 'gemini') {
    const enabled = enabledProviders.has('gemini');
    const supportedModels = LLM_PROVIDER_CAPABILITIES.gemini.models;
    const allowedFromEnv = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_GEMINI);
    if (allowedFromEnv && allowedFromEnv.some((model) => !supportedModels.includes(model))) {
      throw new Error(
        buildAllowlistSubsetError('LLM_ALLOWED_MODELS_GEMINI', supportedModels)
      );
    }
    const allowedModels = allowedFromEnv ?? supportedModels;
    const fallbackModel = LLM_PROVIDER_CAPABILITIES.gemini.defaultModel;
    const envModel = (process.env.GEMINI_MODEL ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(`GEMINI_MODEL must be one of the allowed Gemini models (${allowedModels?.join(', ') ?? ''})`);
    }
    return { enabled, allowedModels, defaultModel };
  }

  if (provider === 'anthropic') {
    const enabled = enabledProviders.has('anthropic');
    const supportedModels = LLM_PROVIDER_CAPABILITIES.anthropic.models;
    const allowedFromEnv = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_ANTHROPIC);
    if (allowedFromEnv && allowedFromEnv.some((model) => !supportedModels.includes(model))) {
      throw new Error(
        buildAllowlistSubsetError('LLM_ALLOWED_MODELS_ANTHROPIC', supportedModels)
      );
    }
    const allowedModels = allowedFromEnv ?? supportedModels;
    const fallbackModel = LLM_PROVIDER_CAPABILITIES.anthropic.defaultModel;
    const envModel = (process.env.ANTHROPIC_MODEL ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(
        `ANTHROPIC_MODEL must be one of the allowed Anthropic models (${allowedModels?.join(', ') ?? ''})`
      );
    }
    return { enabled, allowedModels, defaultModel };
  }

  return { enabled: enabledProviders.has('mock'), allowedModels: null, defaultModel: 'mock' };
}
