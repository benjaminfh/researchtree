import { createRequire } from 'node:module';
import type { PgStoreAdapter, PgRpcResponse } from '@/src/store/pg/adapter';
import { getLocalPgConnectionStrings } from '@/src/server/localPgConfig';

type QueryResult = { rows: any[] };
type QueryFn = (sql: string, values: unknown[]) => Promise<QueryResult>;

type RpcReturnType = 'set' | 'scalar' | 'void';

const RPC_CONFIG: Record<string, { params: string[]; returnType: RpcReturnType }> = {
  rt_get_history_v1: { params: ['p_project_id', 'p_ref_name', 'p_limit'], returnType: 'set' },
  rt_get_canvas_v1: { params: ['p_project_id', 'p_ref_name'], returnType: 'set' },
  rt_list_refs_v1: { params: ['p_project_id'], returnType: 'set' },
  rt_get_starred_node_ids_v1: { params: ['p_project_id'], returnType: 'scalar' },
  rt_append_node_to_ref_v1: {
    params: [
      'p_project_id',
      'p_ref_name',
      'p_kind',
      'p_role',
      'p_content_json',
      'p_node_id',
      'p_commit_message',
      'p_attach_draft',
      'p_raw_response'
    ],
    returnType: 'set'
  },
  rt_create_ref_from_node_parent_v1: {
    params: [
      'p_project_id',
      'p_source_ref_name',
      'p_new_ref_name',
      'p_node_id',
      'p_provider',
      'p_model',
      'p_previous_response_id'
    ],
    returnType: 'set'
  },
  rt_create_ref_from_ref_v1: {
    params: [
      'p_project_id',
      'p_from_ref_name',
      'p_new_ref_name',
      'p_provider',
      'p_model',
      'p_previous_response_id'
    ],
    returnType: 'set'
  },
  rt_create_project: { params: ['p_name', 'p_description', 'p_project_id', 'p_provider', 'p_model'], returnType: 'scalar' },
  rt_get_current_ref_v1: { params: ['p_project_id', 'p_default_ref_name'], returnType: 'scalar' },
  rt_set_current_ref_v1: { params: ['p_project_id', 'p_ref_name', 'p_lock_timeout_ms'], returnType: 'void' },
  rt_get_ref_previous_response_id_v1: { params: ['p_project_id', 'p_ref_name'], returnType: 'scalar' },
  rt_set_ref_previous_response_id_v1: { params: ['p_project_id', 'p_ref_name', 'p_previous_response_id'], returnType: 'void' },
  rt_update_artefact_on_ref: {
    params: [
      'p_project_id',
      'p_ref_name',
      'p_content',
      'p_kind',
      'p_state_node_id',
      'p_state_node_json',
      'p_commit_message',
      'p_lock_timeout_ms'
    ],
    returnType: 'set'
  },
  rt_save_artefact_draft: { params: ['p_project_id', 'p_ref_name', 'p_content'], returnType: 'set' },
  rt_merge_ours_v1: {
    params: [
      'p_project_id',
      'p_target_ref_name',
      'p_source_ref_name',
      'p_merge_node_json',
      'p_merge_node_id',
      'p_commit_message'
    ],
    returnType: 'set'
  },
  rt_toggle_star_v1: { params: ['p_project_id', 'p_node_id'], returnType: 'scalar' },
  rt_get_user_llm_key_status_v1: { params: [], returnType: 'set' },
  rt_set_user_llm_key_v1: { params: ['p_provider', 'p_secret'], returnType: 'void' },
  rt_get_user_llm_key_server_v1: { params: ['p_user_id', 'p_provider'], returnType: 'scalar' }
};

const require = createRequire(import.meta.url);
type PoolClient = { query: (sql: string, values: unknown[]) => Promise<QueryResult> };
let pool: PoolClient | null = null;

function getPool(): PoolClient {
  if (!pool) {
    const { Pool } = require('pg');
    const { connectionString } = getLocalPgConnectionStrings();
    pool = new Pool({ connectionString });
  }
  if (!pool) {
    throw new Error('Local PG pool failed to initialize');
  }
  return pool;
}

export function buildRpcCall(fn: string, params: Record<string, unknown> = {}): { sql: string; values: unknown[]; returnType: RpcReturnType } {
  const config = RPC_CONFIG[fn];
  if (!config) {
    throw new Error(`Local Postgres adapter missing RPC config for ${fn}`);
  }

  const { returnType } = config;
  const paramKeys = config.params;
  let lastIndex = -1;
  for (let i = 0; i < paramKeys.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(params, paramKeys[i])) {
      lastIndex = i;
    }
  }

  const values: unknown[] = [];
  if (lastIndex >= 0) {
    for (let i = 0; i <= lastIndex; i += 1) {
      const key = paramKeys[i];
      if (!Object.prototype.hasOwnProperty.call(params, key)) {
        throw new Error(`Missing parameter ${key} for ${fn}`);
      }
      values.push(params[key]);
    }
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  let sql = '';
  if (returnType === 'set') {
    sql = placeholders.length ? `select * from ${fn}(${placeholders});` : `select * from ${fn}();`;
  } else if (returnType === 'scalar') {
    sql = placeholders.length ? `select ${fn}(${placeholders}) as result;` : `select ${fn}() as result;`;
  } else {
    sql = placeholders.length ? `select ${fn}(${placeholders});` : `select ${fn}();`;
  }

  return { sql, values, returnType };
}

function normalizePgError(error: any) {
  return {
    message: typeof error?.message === 'string' ? error.message : 'RPC failed',
    code: typeof error?.code === 'string' ? error.code : null,
    details: typeof error?.detail === 'string' ? error.detail : null,
    hint: typeof error?.hint === 'string' ? error.hint : null
  };
}

export function createLocalPgAdapter(options?: { query?: QueryFn; bootstrap?: () => Promise<void> }): PgStoreAdapter {
  const bootstrapPromise = options?.bootstrap ? options.bootstrap() : null;
  const query: QueryFn =
    options?.query ??
    (async (sql, values) => {
      const poolInstance = getPool();
      const result = await poolInstance.query(sql, values);
      return { rows: result.rows ?? [] };
    });

  const run = async (fn: string, params?: Record<string, unknown>): Promise<PgRpcResponse> => {
    try {
      if (bootstrapPromise) {
        await bootstrapPromise;
      }
      const { sql, values, returnType } = buildRpcCall(fn, params);
      const result = await query(sql, values);
      if (returnType === 'scalar') {
        const value = result.rows[0]?.result ?? null;
        return { data: value, error: null };
      }
      if (returnType === 'void') {
        return { data: null, error: null };
      }
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: normalizePgError(error) };
    }
  };

  return {
    rpc: run,
    adminRpc: run
  };
}
