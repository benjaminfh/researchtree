// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/auth/callback/route';

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerActionClient: () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      signOut: mocks.signOut
    }
  })
}));

describe('/auth/callback', () => {
  beforeEach(() => {
    mocks.exchangeCodeForSession.mockReset();
    mocks.signOut.mockReset();
    mocks.exchangeCodeForSession.mockResolvedValue({});
    mocks.signOut.mockResolvedValue({});
  });

  it('exchanges the code and signs out after signup confirm', async () => {
    const res = await GET(
      new Request('http://localhost/auth/callback?code=abc&flow=signup-confirm&redirectTo=/projects/p1')
    );

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(mocks.signOut).toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost/projects/p1');
  });

  it('sanitizes redirectTo values', async () => {
    const res = await GET(new Request('http://localhost/auth/callback?redirectTo=https://evil.com'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost/');
  });
});
