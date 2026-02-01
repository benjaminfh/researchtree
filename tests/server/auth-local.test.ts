// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LOCAL_PG_USER_ID } from '@/src/server/localPgConfig';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn()
}));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerClient: () => ({ auth: { getUser: mocks.getUser } })
}));

describe('auth local mode', () => {
  const originalEnv = { ...process.env };
  let getUserOrNull: typeof import('@/src/server/auth').getUserOrNull;
  let requireUser: typeof import('@/src/server/auth').requireUser;

  beforeEach(async () => {
    mocks.getUser.mockReset();
    process.env.RT_PG_ADAPTER = 'local';
    process.env.LOCAL_PG_URL = 'postgres://local';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    vi.resetModules();
    vi.unmock('@/src/server/auth');
    const auth = await import('@/src/server/auth');
    getUserOrNull = auth.getUserOrNull;
    requireUser = auth.requireUser;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns a local user without calling Supabase', async () => {
    const user = await getUserOrNull();
    expect(user?.id).toBe(LOCAL_PG_USER_ID);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('requireUser resolves in local mode', async () => {
    const user = await requireUser();
    expect(user.id).toBe(LOCAL_PG_USER_ID);
  });
});
