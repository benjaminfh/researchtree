// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn()
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser }
  })
}));

const originalEnv = { ...process.env };

describe('middleware auth redirects', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RT_STORE: 'git',
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon'
    };
    mocks.getUser.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('redirects unauthenticated users to login', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const res = await middleware(new NextRequest('http://localhost/projects/p1'));
    expect(res?.headers.get('location')).toBe('http://localhost/login?redirectTo=%2Fprojects%2Fp1&mode=signin#existing-user');
  });

  it('redirects authenticated users away from login', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const res = await middleware(new NextRequest('http://localhost/login?redirectTo=/projects/p1'));
    expect(res?.headers.get('location')).toBe('http://localhost/projects/p1');
  });

  it('returns 500 when Supabase env is incomplete', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const res = await middleware(new NextRequest('http://localhost/projects/p1'));
    expect(res?.status).toBe(500);
    expect(await res?.text()).toBe('Supabase env is incomplete');
  });
});
