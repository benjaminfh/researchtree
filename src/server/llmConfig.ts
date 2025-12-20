import type { LLMProvider } from '@/src/server/llm';

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
  if (parseBooleanEnv(process.env.LLM_ENABLE_OPENAI, true)) enabled.push('openai');
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
  const candidate = (raw === 'openai' || raw === 'gemini' || raw === 'anthropic' || raw === 'mock' ? raw : '') as
    | LLMProvider
    | '';
  if (candidate && enabled.has(candidate)) {
    return candidate;
  }

  for (const fallback of ['openai', 'gemini', 'anthropic', 'mock'] as const) {
    if (enabled.has(fallback)) return fallback;
  }
  // Should be unreachable (dev always includes mock), but keep safe default.
  return 'mock';
}

export function getProviderEnvConfig(provider: LLMProvider): ProviderEnvConfig {
  if (provider === 'openai') {
    const enabled = parseBooleanEnv(process.env.LLM_ENABLE_OPENAI, true);
    const allowedModels = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_OPENAI);
    const fallbackModel = 'gpt-5.2';
    const envModel = (process.env.OPENAI_MODEL ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(`OPENAI_MODEL must be one of LLM_ALLOWED_MODELS_OPENAI (${allowedModels?.join(', ') ?? ''})`);
    }
    return { enabled, allowedModels, defaultModel };
  }

  if (provider === 'gemini') {
    const enabled = parseBooleanEnv(process.env.LLM_ENABLE_GEMINI, true);
    const allowedModels = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_GEMINI);
    const fallbackModel = 'gemini-3-pro-preview';
    const envModel = (process.env.GEMINI_MODEL ?? '').trim();
    const defaultModel = envModel || allowedModels?.[0] || fallbackModel;
    if (!isAllowedModel(allowedModels, defaultModel)) {
      throw new Error(`GEMINI_MODEL must be one of LLM_ALLOWED_MODELS_GEMINI (${allowedModels?.join(', ') ?? ''})`);
    }
    return { enabled, allowedModels, defaultModel };
  }

  if (provider === 'anthropic') {
    const enabled = parseBooleanEnv(process.env.LLM_ENABLE_ANTHROPIC, false);
    const allowedModels = parseCsvEnv(process.env.LLM_ALLOWED_MODELS_ANTHROPIC);
    const fallbackModel = 'claude-3-5-sonnet-latest';
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
