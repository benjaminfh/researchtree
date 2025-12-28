import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { createSupabaseAdminClient } from '@/src/server/supabase/admin';

export type PgRpcResponse = { data: unknown; error: any };

export interface PgStoreAdapter {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<PgRpcResponse>;
  adminRpc: (fn: string, params?: Record<string, unknown>) => Promise<PgRpcResponse>;
}

export function getPgStoreAdapter(): PgStoreAdapter {
  const mode = process.env.RT_PG_ADAPTER ?? 'supabase';
  if (mode === 'local') {
    throw new Error('Local Postgres adapter not implemented yet');
  }
  if (mode !== 'supabase') {
    throw new Error(`Unknown RT_PG_ADAPTER mode: ${mode}`);
  }

  return {
    rpc: (fn, params) => createSupabaseServerClient().rpc(fn, params),
    adminRpc: (fn, params) => createSupabaseAdminClient().rpc(fn, params)
  };
}
