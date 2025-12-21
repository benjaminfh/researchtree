import { beforeEach, describe, expect, it, vi } from 'vitest';

const resetPasswordForEmail = vi.fn();
const createSupabaseServerActionClient = vi.fn(() => ({ auth: { resetPasswordForEmail } }) as any);
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

describe('app/forgot-password/actions requestPasswordReset', () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
    redirect.mockReset();
    createSupabaseServerActionClient.mockClear();
    vi.resetModules();
  });

  it('redirects to check-email on success', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const { requestPasswordReset } = await import('@/app/forgot-password/actions');
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('redirectTo', '/dashboard');

    const result = await requestPasswordReset({ error: null }, formData);

    expect(result.error).toBeNull();
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(String(redirect.mock.calls[0]?.[0])).toContain('/check-email?');
    expect(String(redirect.mock.calls[0]?.[0])).toContain('mode=reset');
  });

  it('returns a generic error when Supabase rejects the request', async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'bad' } });

    const { requestPasswordReset } = await import('@/app/forgot-password/actions');
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('redirectTo', '/dashboard');

    const result = await requestPasswordReset({ error: null }, formData);

    expect(result.error).toMatch(/unable to send/i);
    expect(redirect).not.toHaveBeenCalled();
  });
});

