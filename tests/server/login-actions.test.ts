// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const signUp = vi.fn();
const createSupabaseServerActionClient = vi.fn(() => ({ auth: { signUp } }) as any);
const redirect = vi.fn();

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerActionClient
}));

vi.mock('next/navigation', () => ({
  redirect
}));

vi.mock('next/headers', () => ({
  headers: () =>
    new Map([
      ['x-forwarded-proto', 'https'],
      ['x-forwarded-host', 'example.com']
    ])
}));

describe('app/login/actions signUpWithPassword', () => {
  beforeEach(() => {
    signUp.mockReset();
    redirect.mockReset();
    createSupabaseServerActionClient.mockClear();
    vi.resetModules();
  });

  it('returns an error when the email is already registered (identities empty)', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null
    });

    const { signUpWithPassword } = await import('@/app/login/actions');
    const formData = new FormData();
    formData.set('email', 'taken@example.com');
    formData.set('password', 'password');
    formData.set('redirectTo', '/');

    const result = await signUpWithPassword({ error: null }, formData);

    expect(result.error).toMatch(/signing in/i);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('redirects to check-email for a new user without a session', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [{ provider: 'email' }] }, session: null },
      error: null
    });

    const { signUpWithPassword } = await import('@/app/login/actions');
    const formData = new FormData();
    formData.set('email', 'new@example.com');
    formData.set('password', 'password');
    formData.set('redirectTo', '/dashboard');

    const result = await signUpWithPassword({ error: null }, formData);

    expect(result.error).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(String(redirect.mock.calls[0]?.[0])).toContain('/check-email?');
  });

  it('redirects directly when a session is returned', async () => {
    signUp.mockResolvedValue({
      data: { user: { identities: [{ provider: 'email' }] }, session: { access_token: 'x' } },
      error: null
    });

    const { signUpWithPassword } = await import('@/app/login/actions');
    const formData = new FormData();
    formData.set('email', 'instant@example.com');
    formData.set('password', 'password');
    formData.set('redirectTo', '/dashboard');

    const result = await signUpWithPassword({ error: null }, formData);

    expect(result.error).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});

