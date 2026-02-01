// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((url: string) => {
  const error = new Error(`redirect:${url}`) as Error & { digest?: string };
  error.digest = 'NEXT_REDIRECT';
  throw error;
});

const requestWaitlistAccess = vi.fn();
const redeemAccessCode = vi.fn();

vi.mock('next/navigation', () => ({
  redirect
}));

vi.mock('@/src/server/waitlist', () => ({
  requestWaitlistAccess,
  redeemAccessCode
}));

describe('app/waitlist/actions', () => {
  beforeEach(() => {
    redirect.mockClear();
    requestWaitlistAccess.mockReset();
    redeemAccessCode.mockReset();
    vi.resetModules();
  });

  it('redirects with an error when email is missing', async () => {
    const { submitWaitlistRequest } = await import('@/app/waitlist/actions');
    const formData = new FormData();
    formData.set('redirectTo', '/waitlist');

    await expect(submitWaitlistRequest(formData)).rejects.toThrow(
      'redirect:/waitlist?requested=0&error=Email%20is%20required.'
    );
    expect(requestWaitlistAccess).not.toHaveBeenCalled();
  });

  it('redirects with success after requesting access', async () => {
    requestWaitlistAccess.mockResolvedValue(undefined);
    const { submitWaitlistRequest } = await import('@/app/waitlist/actions');
    const formData = new FormData();
    formData.set('email', ' Test@Example.com ');
    formData.set('redirectTo', '/waitlist');

    await expect(submitWaitlistRequest(formData)).rejects.toThrow(
      'redirect:/waitlist?requested=1&email=Test%40Example.com'
    );
    expect(requestWaitlistAccess).toHaveBeenCalledWith('Test@Example.com');
  });

  it('redirects with an error when waitlist request fails', async () => {
    requestWaitlistAccess.mockRejectedValue(new Error('boom'));
    const { submitWaitlistRequest } = await import('@/app/waitlist/actions');
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('redirectTo', '/waitlist');

    await expect(submitWaitlistRequest(formData)).rejects.toThrow(
      'redirect:/waitlist?requested=0&error=boom'
    );
  });

  it('redirects with an error when email or code is missing', async () => {
    const { submitAccessCode } = await import('@/app/waitlist/actions');
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('redirectTo', '/waitlist');

    await expect(submitAccessCode(formData)).rejects.toThrow(
      'redirect:/waitlist?codeApplied=0&error=Email%20and%20access%20code%20are%20required.'
    );
    expect(redeemAccessCode).not.toHaveBeenCalled();
  });

  it('redirects with an error when the access code is invalid', async () => {
    redeemAccessCode.mockResolvedValue(false);
    const { submitAccessCode } = await import('@/app/waitlist/actions');
    const formData = new FormData();
    formData.set('email', 'user@example.com');
    formData.set('code', 'nope');
    formData.set('redirectTo', '/waitlist');

    await expect(submitAccessCode(formData)).rejects.toThrow(
      'redirect:/waitlist?codeApplied=0&error=Invalid%20or%20exhausted%20access%20code.'
    );
  });

  it('redirects with success when the access code is redeemed', async () => {
    redeemAccessCode.mockResolvedValue(true);
    const { submitAccessCode } = await import('@/app/waitlist/actions');
    const formData = new FormData();
    formData.set('email', ' user@example.com ');
    formData.set('code', ' CODE ');
    formData.set('redirectTo', '/waitlist');

    await expect(submitAccessCode(formData)).rejects.toThrow(
      'redirect:/waitlist?codeApplied=1&email=user%40example.com'
    );
    expect(redeemAccessCode).toHaveBeenCalledWith('user@example.com', 'CODE');
  });
});
