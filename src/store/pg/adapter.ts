import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { createSupabaseAdminClient } from '@/src/server/supabase/admin';
import { createLocalPgAdapter } from '@/src/store/pg/localAdapter';

export type PgRpcResponse = { data: unknown; error: any };

export interface PgStoreAdapter {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<PgRpcResponse>;
  adminRpc: (fn: string, params?: Record<string, unknown>) => Promise<PgRpcResponse>;
}

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function getPgStoreAdapter(): PgStoreAdapter {
  const mode = process.env.RT_PG_ADAPTER ?? 'supabase';
  if (mode === 'local') {
    if (hasSupabaseEnv()) {
      throw new Error('RT_PG_ADAPTER=local cannot be used with Supabase env vars present');
    }
    if (!process.env.LOCAL_PG_URL) {
      throw new Error('RT_PG_ADAPTER=local requires LOCAL_PG_URL');
    }
    return createLocalPgAdapter();
  }
  if (mode !== 'supabase') {
    throw new Error(`Unknown RT_PG_ADAPTER mode: ${mode}`);
  }

  return {
    rpc: (fn, params) => createSupabaseServerClient().rpc(fn, params),
    adminRpc: (fn, params) => createSupabaseAdminClient().rpc(fn, params)
  };
}
