import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { createSupabaseAdminClient } from '@/src/server/supabase/admin';
import { maybeBootstrapLocalPg } from '@/src/server/localPgBootstrap';
import { assertLocalPgModeConfig } from '@/src/server/pgMode';
import { createLocalPgAdapter } from '@/src/store/pg/localAdapter';

export type PgRpcResponse = { data: unknown; error: any };

export interface PgStoreAdapter {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<PgRpcResponse>;
  adminRpc: (fn: string, params?: Record<string, unknown>) => Promise<PgRpcResponse>;
}

// Keep pg data access behind this adapter so local/supabase routing stays consistent.
export function getPgStoreAdapter(): PgStoreAdapter {
  const mode = process.env.RT_PG_ADAPTER ?? 'supabase';
  if (mode === 'local') {
    assertLocalPgModeConfig();
    return createLocalPgAdapter({ bootstrap: maybeBootstrapLocalPg });
  }
  if (mode !== 'supabase') {
    throw new Error(`Unknown RT_PG_ADAPTER mode: ${mode}`);
  }

  return {
    rpc: async (fn, params) => await createSupabaseServerClient().rpc(fn, params),
    adminRpc: async (fn, params) => await createSupabaseAdminClient().rpc(fn, params)
  };
}
