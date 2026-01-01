// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const signUp = vi.fn();
const signInWithPassword = vi.fn();
const createSupabaseServerActionClient = vi.fn(() => ({ auth: { signUp, signInWithPassword } }) as any);
const redirect = vi.fn();
const checkEmailAllowedForAuth = vi.fn(async () => ({ allowed: true }));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerActionClient
}));

vi.mock('@/src/server/waitlist', () => ({
  checkEmailAllowedForAuth
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
    signInWithPassword.mockReset();
    redirect.mockReset();
    checkEmailAllowedForAuth.mockClear();
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
    formData.set('password', 'Validpass1!');
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
    formData.set('password', 'Validpass1!');
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
    formData.set('password', 'Validpass1!');
    formData.set('redirectTo', '/dashboard');

    const result = await signUpWithPassword({ error: null }, formData);

    expect(result.error).toBeNull();
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('rejects passwords shorter than 10 characters', async () => {
    const { signUpWithPassword } = await import('@/app/login/actions');
    const formData = new FormData();
    formData.set('email', 'short@example.com');
    formData.set('password', 'short');
    formData.set('redirectTo', '/');

    const result = await signUpWithPassword({ error: null }, formData);

    expect(result.error).toMatch(/at least 10 characters/i);
    expect(signUp).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rejects passwords missing character variety', async () => {
    const { signUpWithPassword } = await import('@/app/login/actions');
    const formData = new FormData();
    formData.set('email', 'simple@example.com');
    formData.set('password', 'alllowercase1');
    formData.set('redirectTo', '/');

    const result = await signUpWithPassword({ error: null }, formData);

    expect(result.error).toMatch(/include lowercase, uppercase, number, and symbol/i);
    expect(signUp).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('app/login/actions signInWithPassword', () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
    redirect.mockReset();
    checkEmailAllowedForAuth.mockClear();
    createSupabaseServerActionClient.mockClear();
    vi.resetModules();
  });

  it('rejects passwords shorter than 10 characters', async () => {
    const { signInWithPassword: signIn } = await import('@/app/login/actions');
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'short');
    formData.set('redirectTo', '/');

    const result = await signIn({ error: null }, formData);

    expect(result.error).toMatch(/at least 10 characters/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rejects passwords missing character variety', async () => {
    const { signInWithPassword: signIn } = await import('@/app/login/actions');
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('password', 'ALLUPPERCASE1');
    formData.set('redirectTo', '/');

    const result = await signIn({ error: null }, formData);

    expect(result.error).toMatch(/include lowercase, uppercase, number, and symbol/i);
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
