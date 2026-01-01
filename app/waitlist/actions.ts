// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use server';

import { redirect } from 'next/navigation';
import { redeemAccessCode, requestWaitlistAccess } from '@/src/server/waitlist';

function isRedirectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

function sanitizeRedirectTo(input: string | null): string {
  if (!input) return '/login';
  if (!input.startsWith('/')) return '/login';
  if (input.startsWith('//')) return '/login';
  return input;
}

export async function submitWaitlistRequest(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const redirectTo = sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/login';

  if (!email) {
    redirect(`${redirectTo}?requested=0&error=${encodeURIComponent('Email is required.')}`);
  }

  try {
    await requestWaitlistAccess(email);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = (err as Error)?.message ?? 'Request failed.';
    redirect(`${redirectTo}?requested=0&error=${encodeURIComponent(message)}`);
  }

  redirect(`${redirectTo}?requested=1&email=${encodeURIComponent(email)}`);
}

export async function submitAccessCode(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  const redirectTo = sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/waitlist';

  if (!email || !code) {
    redirect(`${redirectTo}?codeApplied=0&error=${encodeURIComponent('Email and access code are required.')}`);
  }

  try {
    const ok = await redeemAccessCode(email, code);
    if (!ok) {
      redirect(`${redirectTo}?codeApplied=0&error=${encodeURIComponent('Invalid or exhausted access code.')}`);
    }
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = (err as Error)?.message ?? 'Access code failed.';
    redirect(`${redirectTo}?codeApplied=0&error=${encodeURIComponent(message)}`);
  }

  redirect(`${redirectTo}?codeApplied=1&email=${encodeURIComponent(email)}`);
}
