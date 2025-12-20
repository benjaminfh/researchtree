import { describe, expect, it } from 'vitest';
import { assertSupabaseConfigured, getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from '@/src/server/supabase/env';

describe('supabase env helpers', () => {
  it('returns null when env vars are missing', () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(getSupabaseUrl()).toBeNull();
      expect(getSupabaseAnonKey()).toBeNull();
      expect(getSupabaseServiceRoleKey()).toBeNull();
      expect(() => assertSupabaseConfigured()).toThrow(/Supabase env missing/i);
    } finally {
      if (originalUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalAnon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
      if (originalService !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
    }
  });

  it('accepts valid url + anon key', () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

      expect(assertSupabaseConfigured()).toEqual({ url: 'https://example.supabase.co', anonKey: 'anon-key' });
    } finally {
      if (originalUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (originalAnon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
      else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
  });
});

