import type { LLMProvider } from '@/src/server/llm';
import { badRequest, internalError } from '@/src/server/http';
import { getDeployEnv } from '@/src/server/llmConfig';

type KeyedProvider = Exclude<LLMProvider, 'mock'>;

function labelForProvider(provider: LLMProvider): string {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'anthropic') return 'Anthropic';
  return 'Mock';
}

function envVarForProvider(provider: LLMProvider): string | null {
  if (provider === 'openai') return 'OPENAI_API_KEY';
  if (provider === 'gemini') return 'GEMINI_API_KEY';
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY';
  return null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function requireUserApiKeyForProvider(provider: LLMProvider): Promise<string | null> {
  if (provider === 'mock') return null;
  const keyed = provider as KeyedProvider;

  const envVar = envVarForProvider(provider);
  if (getDeployEnv() !== 'dev' && envVar) {
    if (process.env[envVar]) {
      console.warn('[llmUserKeys] Ignoring env API key in non-dev deploy', { provider, envVar });
    }
  }

  let key: string | null = null;
  try {
    const { rtGetUserLlmKeyV1 } = await import('@/src/store/pg/userLlmKeys');
    key = await rtGetUserLlmKeyV1({ provider: keyed });
  } catch (error) {
    let configured: boolean | null = null;
    try {
      const { rtGetUserLlmKeyStatusV1 } = await import('@/src/store/pg/userLlmKeys');
      const status = await rtGetUserLlmKeyStatusV1();
      configured =
        keyed === 'openai' ? status.hasOpenAI : keyed === 'gemini' ? status.hasGemini : keyed === 'anthropic' ? status.hasAnthropic : null;
    } catch {
      configured = null;
    }

    const reason = extractErrorMessage(error);
    console.error('[llmUserKeys] Failed to read user API key', { provider: keyed, configured, reason });
    throw internalError(
      `Failed to read ${labelForProvider(keyed)} token from Profile. Please re-save it in Profile and try again.`,
      { provider: keyed, configured, reason }
    );
  }

  if (!key) {
    let configured: boolean | null = null;
    try {
      const { rtGetUserLlmKeyStatusV1 } = await import('@/src/store/pg/userLlmKeys');
      const status = await rtGetUserLlmKeyStatusV1();
      configured =
        keyed === 'openai' ? status.hasOpenAI : keyed === 'gemini' ? status.hasGemini : keyed === 'anthropic' ? status.hasAnthropic : null;
    } catch {
      configured = null;
    }

    if (configured === true) {
      throw badRequest(
        `${labelForProvider(keyed)} token is marked as configured, but it could not be read. Re-save it in Profile and try again.`,
        { provider: keyed, configured }
      );
    }

    throw badRequest(`No ${labelForProvider(keyed)} API key configured. Add one in Profile to use this provider.`, {
      provider: keyed,
      configured
    });
  }

  return key;
}

