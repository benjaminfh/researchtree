import { describe, it, expect, afterEach } from 'vitest';
import { assertLocalPgModeConfig } from '@/src/server/pgMode';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('pg mode config', () => {
  it('does nothing when not in local mode', () => {
    delete process.env.RT_PG_ADAPTER;
    expect(() => assertLocalPgModeConfig()).not.toThrow();
  });

  it('throws when local mode is missing LOCAL_PG_URL', () => {
    process.env.RT_PG_ADAPTER = 'local';
    delete process.env.LOCAL_PG_URL;
    expect(() => assertLocalPgModeConfig()).toThrow('RT_PG_ADAPTER=local requires LOCAL_PG_URL');
  });

  it('throws when local mode is set with Supabase env vars', () => {
    process.env.RT_PG_ADAPTER = 'local';
    process.env.LOCAL_PG_URL = 'postgres://local';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(() => assertLocalPgModeConfig()).toThrow('RT_PG_ADAPTER=local cannot be used with Supabase env vars present');
  });

  it('passes when local mode has LOCAL_PG_URL and no Supabase env', () => {
    process.env.RT_PG_ADAPTER = 'local';
    process.env.LOCAL_PG_URL = 'postgres://local';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => assertLocalPgModeConfig()).not.toThrow();
  });
});
