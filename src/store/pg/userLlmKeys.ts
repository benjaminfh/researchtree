import { createSupabaseServerClient } from '@/src/server/supabase/server';
import type { LLMProvider } from '@/src/server/llm';
import { createSupabaseAdminClient } from '@/src/server/supabase/admin';

type KeyedProvider = Exclude<LLMProvider, 'mock'>;

function formatRpcError(error: any): string {
  const message = typeof error?.message === 'string' ? error.message : 'RPC failed';
  const code = typeof error?.code === 'string' ? error.code : null;
  const details = typeof error?.details === 'string' ? error.details : null;
  const hint = typeof error?.hint === 'string' ? error.hint : null;
  return [
    code ? `[${code}]` : null,
    message,
    details ? `details=${details}` : null,
    hint ? `hint=${hint}` : null
  ]
    .filter(Boolean)
    .join(' ');
}

function assertKeyedProvider(provider: LLMProvider): asserts provider is KeyedProvider {
  if (provider === 'mock') {
    throw new Error('Mock provider has no API key');
  }
}

export async function rtGetUserLlmKeyStatusV1(): Promise<{
  hasOpenAI: boolean;
  hasGemini: boolean;
  hasAnthropic: boolean;
  updatedAt: string | null;
}> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_get_user_llm_key_status_v1');
  if (error) {
    throw new Error(formatRpcError(error));
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { hasOpenAI: false, hasGemini: false, hasAnthropic: false, updatedAt: null };
  }

  return {
    hasOpenAI: Boolean((row as any).has_openai),
    hasGemini: Boolean((row as any).has_gemini),
    hasAnthropic: Boolean((row as any).has_anthropic),
    updatedAt: (row as any).updated_at ? String((row as any).updated_at) : null
  };
}

export async function rtSetUserLlmKeyV1(input: { provider: KeyedProvider; secret: string | null }): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('rt_set_user_llm_key_v1', {
    p_provider: input.provider,
    p_secret: input.secret
  });
  if (error) {
    throw new Error(formatRpcError(error));
  }
}

export async function rtGetUserLlmKeyServerV1(input: { userId: string; provider: LLMProvider }): Promise<string | null> {
  assertKeyedProvider(input.provider);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('rt_get_user_llm_key_server_v1', {
    p_user_id: input.userId,
    p_provider: input.provider
  });
  if (error) {
    throw new Error(formatRpcError(error));
  }
  if (data == null) return null;
  return String(data);
}
