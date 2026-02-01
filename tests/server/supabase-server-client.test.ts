// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerClient = vi.fn(() => ({}) as any);

vi.mock('@supabase/ssr', () => ({
  createServerClient
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: () => undefined
  })
}));

describe('createSupabaseServerClient helpers', () => {
  beforeEach(() => {
    createServerClient.mockClear();
    vi.resetModules();
  });

  it('provides setAll when cookies are writable', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    const { createSupabaseServerClient } = await import('@/src/server/supabase/server');
    createSupabaseServerClient();

    expect(createServerClient).toHaveBeenCalledTimes(1);
    const options = createServerClient.mock.calls[0]?.[2] as any;
    expect(options.cookies).toBeDefined();
    expect(options.cookies.getAll).toEqual(expect.any(Function));
    expect(options.cookies.setAll).toEqual(expect.any(Function));
  });

  it('includes setAll for server actions and routes', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    const { createSupabaseServerActionClient } = await import('@/src/server/supabase/server');
    createSupabaseServerActionClient();

    expect(createServerClient).toHaveBeenCalledTimes(1);
    const options = createServerClient.mock.calls[0]?.[2] as any;
    expect(options.cookies).toBeDefined();
    expect(options.cookies.getAll).toEqual(expect.any(Function));
    expect(options.cookies.setAll).toEqual(expect.any(Function));
  });
});
