// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PUT } from '@/app/api/profile/password/route';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn()
}));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerActionClient: () => ({
    auth: {
      getUser: mocks.getUser,
      updateUser: mocks.updateUser
    }
  })
}));

describe('/api/profile/password', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.updateUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it('updates the password for same-origin requests', async () => {
    const res = await PUT(
      new Request('http://localhost/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ newPassword: 'password123', confirmPassword: 'password123' })
      })
    );

    expect(res.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'password123' });
  });

  it('rejects mismatched passwords', async () => {
    const res = await PUT(
      new Request('http://localhost/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ newPassword: 'password123', confirmPassword: 'password124' })
      })
    );

    expect(res.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('rejects requests from an invalid origin', async () => {
    const res = await PUT(
      new Request('http://localhost/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', origin: 'http://evil.test' },
        body: JSON.stringify({ newPassword: 'password123', confirmPassword: 'password123' })
      })
    );

    expect(res.status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
