// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import type { LLMProvider } from '@/src/server/llm';
import { badRequest, internalError } from '@/src/server/http';
import { getDeployEnv } from '@/src/server/llmConfig';
import { requireUser } from '@/src/server/auth';

type KeyedProvider = Exclude<LLMProvider, 'mock'>;

function labelForProvider(provider: LLMProvider): string {
  if (provider === 'openai' || provider === 'openai_responses') return 'OpenAI';
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'anthropic') return 'Anthropic';
  return 'Mock';
}

function envVarForProvider(provider: LLMProvider): string | null {
  if (provider === 'openai' || provider === 'openai_responses') return 'OPENAI_API_KEY';
  if (provider === 'gemini') return 'GEMINI_API_KEY';
  if (provider === 'anthropic') return 'ANTHROPIC_API_KEY';
  return null;
}

function normalizeKeyedProvider(provider: LLMProvider): KeyedProvider {
  return provider === 'openai_responses' ? 'openai' : (provider as KeyedProvider);
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

function isVaultReadCompatIssue(reason: string): boolean {
  const normalized = reason.toLowerCase();
  if (normalized.includes('vault.decrypt_secret') && normalized.includes('does not exist')) return true;
  if (normalized.includes('vault secret read is not supported')) return true;
  return false;
}

function isMissingServiceRoleEnv(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized.includes('supabase admin env missing') || normalized.includes('supabase_service_role_key') || normalized.includes('service role');
}

export async function requireUserApiKeyForProvider(provider: LLMProvider): Promise<string | null> {
  if (provider === 'mock') return null;
  const keyed = normalizeKeyedProvider(provider);
  const user = await requireUser();

  const envVar = envVarForProvider(provider);
  if (getDeployEnv() !== 'dev' && envVar) {
    if (process.env[envVar]) {
      console.warn('[llmUserKeys] Ignoring env API key in non-dev deploy', { provider, envVar });
    }
  }

  let key: string | null = null;
  try {
    const { rtGetUserLlmKeyServerV1 } = await import('@/src/store/pg/userLlmKeys');
    key = await rtGetUserLlmKeyServerV1({ userId: user.id, provider: keyed });
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
    if (isVaultReadCompatIssue(reason)) {
      throw internalError(
        `Server is missing Supabase Vault secret decryption support. Apply the latest Supabase migrations and try again.`,
        { provider: keyed, configured, reason }
      );
    }
    if (isMissingServiceRoleEnv(reason)) {
      throw internalError(
        `Server is missing Supabase service-role credentials required to read Profile tokens. Set SUPABASE_SERVICE_ROLE_KEY (and redeploy) and try again.`,
        { provider: keyed, configured, reason }
      );
    }

    throw internalError(`Failed to read ${labelForProvider(keyed)} token from Profile. Please re-save it and try again.`, {
      provider: keyed,
      configured,
      reason
    });
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
