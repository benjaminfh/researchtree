// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isEmailWhitelisted,
  checkEmailAllowedForAuth,
  requestWaitlistAccess,
  approveEmail,
  redeemAccessCode
} from '@/src/server/waitlist';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock('@/src/server/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: mocks.from,
    rpc: mocks.rpc
  })
}));

const originalEnv = { ...process.env };

describe('waitlist helpers', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('skips allowlist checks when the waitlist is disabled', async () => {
    process.env.RT_WAITLIST_ENFORCE = 'false';
    const allowed = await isEmailWhitelisted('Test@Example.com');
    expect(allowed).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns false when email is not on the allowlist', async () => {
    process.env.RT_WAITLIST_ENFORCE = '1';
    const chain = {
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null }))
    };
    const allowlist = { select: vi.fn(() => chain) };
    mocks.from.mockReturnValue(allowlist);

    const allowed = await isEmailWhitelisted('  Test@Example.com ');
    expect(allowed).toBe(false);
    expect(chain.eq).toHaveBeenCalledWith('email', 'test@example.com');
  });

  it('rejects empty email in auth gate checks', async () => {
    process.env.RT_WAITLIST_ENFORCE = '1';
    const result = await checkEmailAllowedForAuth('   ');
    expect(result.allowed).toBe(false);
    expect(result.error).toBe('Email is required.');
  });

  it('returns a waitlist error when access is not granted', async () => {
    process.env.RT_WAITLIST_ENFORCE = 'true';
    const chain = {
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null }))
    };
    const allowlist = { select: vi.fn(() => chain) };
    mocks.from.mockReturnValue(allowlist);

    const result = await checkEmailAllowedForAuth('user@example.com');
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/invite-only/i);
  });

  it('inserts a waitlist request when none exists', async () => {
    process.env.RT_WAITLIST_ENFORCE = 'true';
    const selectChain = {
      eq: vi.fn(() => selectChain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null }))
    };
    const insert = vi.fn(async () => ({ error: null }));
    const waitlist = {
      select: vi.fn(() => selectChain),
      insert
    };
    mocks.from.mockReturnValue(waitlist);

    await requestWaitlistAccess('  Test@Example.com ');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        status: 'pending',
        request_count: 1,
        last_requested_at: expect.any(String)
      })
    );
  });

  it('updates an existing waitlist request count', async () => {
    process.env.RT_WAITLIST_ENFORCE = 'true';
    const selectChain = {
      eq: vi.fn(() => selectChain),
      maybeSingle: vi.fn(async () => ({ data: { request_count: 3 }, error: null }))
    };
    const updateEq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq: updateEq }));
    const waitlist = {
      select: vi.fn(() => selectChain),
      update
    };
    mocks.from.mockReturnValue(waitlist);

    await requestWaitlistAccess('Test@Example.com');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        request_count: 4,
        last_requested_at: expect.any(String)
      })
    );
    expect(updateEq).toHaveBeenCalledWith('email', 'test@example.com');
  });

  it('approves an email and updates waitlist state', async () => {
    process.env.RT_WAITLIST_ENFORCE = 'true';
    const allowlist = {
      upsert: vi.fn(async () => ({ error: null }))
    };
    const updateEq = vi.fn(async () => ({ error: null }));
    const waitlist = {
      update: vi.fn(() => ({ eq: updateEq }))
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === 'email_allowlist') return allowlist;
      if (table === 'waitlist_requests') return waitlist;
      return {};
    });

    await approveEmail(' Test@Example.com ', ' Admin@Example.com ');
    expect(allowlist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'test@example.com',
        created_by: 'admin@example.com'
      }),
      { onConflict: 'email' }
    );
    expect(updateEq).toHaveBeenCalledWith('email', 'test@example.com');
  });

  it('redeems access codes via RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const ok = await redeemAccessCode(' User@Example.com ', ' CODE ');
    expect(ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('rt_redeem_access_code_v1', {
      p_code: 'code',
      p_email: 'user@example.com',
      p_approved_by: null
    });
  });

  it('rejects empty access codes', async () => {
    await expect(redeemAccessCode('user@example.com', '  ')).rejects.toThrow('Access code is required.');
  });
});
