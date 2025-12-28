import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPgStoreAdapter } from '@/src/store/pg/adapter';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  adminRpc: vi.fn()
}));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerClient: () => ({ rpc: mocks.rpc })
}));

vi.mock('@/src/server/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.adminRpc })
}));

describe('getPgStoreAdapter', () => {
  const originalMode = process.env.RT_PG_ADAPTER;

  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.adminRpc.mockReset();
    delete process.env.RT_PG_ADAPTER;
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.RT_PG_ADAPTER;
    } else {
      process.env.RT_PG_ADAPTER = originalMode;
    }
  });

  it('defaults to the Supabase adapter', async () => {
    mocks.rpc.mockResolvedValue({ data: 'ok', error: null });
    mocks.adminRpc.mockResolvedValue({ data: 'admin-ok', error: null });

    const adapter = getPgStoreAdapter();
    const result = await adapter.rpc('fn', { a: 1 });
    const adminResult = await adapter.adminRpc('admin_fn', { b: 2 });

    expect(mocks.rpc).toHaveBeenCalledWith('fn', { a: 1 });
    expect(mocks.adminRpc).toHaveBeenCalledWith('admin_fn', { b: 2 });
    expect(result).toEqual({ data: 'ok', error: null });
    expect(adminResult).toEqual({ data: 'admin-ok', error: null });
  });

  it('throws when local adapter is requested', () => {
    process.env.RT_PG_ADAPTER = 'local';
    expect(() => getPgStoreAdapter()).toThrow('Local Postgres adapter not implemented yet');
  });

  it('throws on unknown adapter modes', () => {
    process.env.RT_PG_ADAPTER = 'weird';
    expect(() => getPgStoreAdapter()).toThrow('Unknown RT_PG_ADAPTER mode: weird');
  });
});
