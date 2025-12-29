// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateUser = vi.fn();
const getUser = vi.fn();
const createSupabaseServerActionClient = vi.fn(() => ({ auth: { updateUser, getUser } }) as any);
const redirect = vi.fn();

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerActionClient
}));

vi.mock('next/navigation', () => ({
  redirect
}));

describe('app/reset-password/actions updatePassword', () => {
  beforeEach(() => {
    updateUser.mockReset();
    getUser.mockReset();
    redirect.mockReset();
    createSupabaseServerActionClient.mockClear();
    vi.resetModules();
  });

  it('returns an error when passwords do not match', async () => {
    const { updatePassword } = await import('@/app/reset-password/actions');
    const formData = new FormData();
    formData.set('password', 'password123');
    formData.set('confirmPassword', 'different');
    formData.set('redirectTo', '/');

    const result = await updatePassword({ error: null }, formData);

    expect(result.error).toMatch(/do not match/i);
    expect(updateUser).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('requires a signed-in (recovery) user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const { updatePassword } = await import('@/app/reset-password/actions');
    const formData = new FormData();
    formData.set('password', 'password123');
    formData.set('confirmPassword', 'password123');
    formData.set('redirectTo', '/');

    const result = await updatePassword({ error: null }, formData);

    expect(result.error).toMatch(/reset link/i);
    expect(updateUser).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('updates the password and redirects', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const { updatePassword } = await import('@/app/reset-password/actions');
    const formData = new FormData();
    formData.set('password', 'password123');
    formData.set('confirmPassword', 'password123');
    formData.set('redirectTo', '/dashboard');

    const result = await updatePassword({ error: null }, formData);

    expect(result.error).toBeNull();
    expect(updateUser).toHaveBeenCalledWith({ password: 'password123' });
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});

