'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';
import { checkEmailAllowedForAuth } from '@/src/server/waitlist';

type PasswordResetActionState = { error: string | null };

function getRequestOrigin(): string | null {
  const headerList = headers();
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  if (!host) return null;
  return `${proto}://${host}`;
}

function sanitizeRedirectTo(input: string | null): string | null {
  if (!input) return null;
  if (!input.startsWith('/')) return null;
  if (input.startsWith('//')) return null;
  return input;
}

export async function requestPasswordReset(
  _prevState: PasswordResetActionState,
  formData: FormData
): Promise<PasswordResetActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const redirectTo = sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/';

  if (!email) {
    return { error: 'Email is required.' };
  }

  const sentRedirect = `/check-email?mode=reset&redirectTo=${encodeURIComponent(redirectTo)}&email=${encodeURIComponent(email)}`;

  try {
    const gate = await checkEmailAllowedForAuth(email);
    if (!gate.allowed) {
      redirect(sentRedirect);
      return { error: null };
    }

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
