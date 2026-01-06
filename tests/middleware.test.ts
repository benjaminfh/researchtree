// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

const getUserMock = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock
    },
    cookies: {
      getAll: vi.fn(() => []),
      setAll: vi.fn()
    }
  }))
}));

describe('middleware redirect behavior', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...envBackup,
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      RT_STORE: 'pg'
    };
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('redirects unauthenticated users to login with sign-in indicators', async () => {
    const request = new NextRequest('https://app.example.com/projects/abc?foo=bar');

    const response = await middleware(request);

    expect(response).toBeDefined();
    const location = response.headers.get('location');
    expect(location).toContain('/login?');
    expect(location).toContain('redirectTo=%2Fprojects%2Fabc%3Ffoo%3Dbar');
    expect(location).toContain('mode=signin');
    expect(location).toContain('#existing-user');
  });
});
