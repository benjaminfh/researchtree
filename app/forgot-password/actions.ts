// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';
import { getRequestOrigin } from '@/src/server/requestOrigin';

type PasswordResetActionState = { error: string | null };

function sanitizeRedirectTo(input: string | null): string | null {
  if (!input) return null;
  if (!input.startsWith('/')) return null;
  if (input.startsWith('//')) return null;
  return input;
}

function ensureSignInModeForLogin(redirectTo: string): string {
  if (!redirectTo.startsWith('/login')) return redirectTo;
  const url = new URL(redirectTo, 'http://local');
  url.searchParams.set('mode', 'signIn');
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export async function requestPasswordReset(
  _prevState: PasswordResetActionState,
  formData: FormData
): Promise<PasswordResetActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const redirectTo =
    ensureSignInModeForLogin(sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/');

  if (!email) {
    return { error: 'Email is required.' };
  }

  const sentRedirect = `/check-email?mode=reset&redirectTo=${encodeURIComponent(redirectTo)}&email=${encodeURIComponent(email)}`;

  try {
    const origin = getRequestOrigin();
    if (!origin) {
      return { error: 'Unable to determine request origin.' };
    }

    const recoveryRedirectTo = `/reset-password?redirectTo=${encodeURIComponent(redirectTo)}`;
    const emailRedirectTo = `${origin}/auth/callback?redirectTo=${encodeURIComponent(recoveryRedirectTo)}`;

    const supabase = createSupabaseServerActionClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: emailRedirectTo });
    if (error) {
      return { error: 'Unable to send reset email. Please try again later.' };
    }
  } catch {
    return { error: 'Unable to send reset email. Please try again later.' };
  }

  redirect(sentRedirect);
  return { error: null };
}
