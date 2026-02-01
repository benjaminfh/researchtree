// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/auth/me/route';

describe('/api/auth/me', () => {
  it('returns the current user', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual({ id: 'test-user-id', email: 'test@example.com' });
  });
});
