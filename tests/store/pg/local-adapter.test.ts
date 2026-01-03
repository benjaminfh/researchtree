// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, vi } from 'vitest';
import { buildRpcCall, createLocalPgAdapter } from '@/src/store/pg/localAdapter';

const baseParams = {
  p_project_id: 'p1',
  p_ref_id: 'ref-1',
  p_limit: 50
};

describe('local pg adapter', () => {
  it('builds SQL for set-returning RPCs with positional params', () => {
    const { sql, values, returnType } = buildRpcCall('rt_get_history_v2', baseParams);
    expect(returnType).toBe('set');
    expect(sql).toBe('select * from rt_get_history_v2($1, $2, $3);');
    expect(values).toEqual(['p1', 'ref-1', 50]);
  });

  it('builds SQL for scalar RPCs with positional params', () => {
    const { sql, values, returnType } = buildRpcCall('rt_create_project', {
      p_name: 'Test',
      p_description: null,
      p_project_id: null,
      p_provider: null,
      p_model: null
    });
    expect(returnType).toBe('scalar');
    expect(sql).toBe('select rt_create_project($1, $2, $3, $4, $5) as result;');
    expect(values).toEqual(['Test', null, null, null, null]);
  });

  it('omits trailing optional params when not provided', () => {
    const { sql, values } = buildRpcCall('rt_get_current_ref_v2', { p_project_id: 'p1' });
    expect(sql).toBe('select * from rt_get_current_ref_v2($1);');
    expect(values).toEqual(['p1']);
  });

  it('throws when missing a non-trailing param', () => {
    expect(() => buildRpcCall('rt_get_history_v2', { p_project_id: 'p1', p_limit: 2 })).toThrow(
      'Missing parameter p_ref_id for rt_get_history_v2'
    );
  });

  it('runs and normalizes scalar + set + void responses', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('select rt_create_project')) {
        return { rows: [{ result: 'proj-1' }] };
      }
      if (sql.startsWith('select * from rt_list_refs_v2')) {
        return { rows: [{ id: 'ref-1', name: 'main' }] };
      }
      return { rows: [] };
    });

    const adapter = createLocalPgAdapter({ query });
    const scalar = await adapter.rpc('rt_create_project', {
      p_name: 'Test',
      p_description: null,
      p_project_id: null,
      p_provider: null,
      p_model: null
    });
    const set = await adapter.rpc('rt_list_refs_v2', { p_project_id: 'p1' });
    const voidResult = await adapter.rpc('rt_set_current_ref_v2', {
      p_project_id: 'p1',
      p_ref_id: 'ref-1',
      p_lock_timeout_ms: 3000
    });

    expect(scalar).toEqual({ data: 'proj-1', error: null });
    expect(set).toEqual({ data: [{ id: 'ref-1', name: 'main' }], error: null });
    expect(voidResult).toEqual({ data: null, error: null });
  });

  it('normalizes query errors', async () => {
    const query = vi.fn(async () => {
      const err = new Error('boom') as Error & { code?: string; detail?: string; hint?: string };
      err.code = 'E1';
      err.detail = 'detail';
      err.hint = 'hint';
      throw err;
    });

    const adapter = createLocalPgAdapter({ query });
    const result = await adapter.rpc('rt_list_refs_v2', { p_project_id: 'p1' });
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('boom');
    expect(result.error?.code).toBe('E1');
  });
});
