// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';
import { checkEmailAllowedForAuth } from '@/src/server/waitlist';
import { getRequestOrigin } from '@/src/server/requestOrigin';

type AuthActionState = { error: string | null; mode?: 'signIn' | 'signUp' | null };

function sanitizeRedirectTo(input: string | null): string | null {
  if (!input) return null;
  if (!input.startsWith('/')) return null;
  if (input.startsWith('//')) return null;
  return input;
}

function validatePasswordPolicy(password: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters.';
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    return 'Password must include lowercase, uppercase, number, and symbol characters.';
  }
  return null;
}

export async function signInWithPassword(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const redirectTo = sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/';

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  try {
    const supabase = createSupabaseServerActionClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }
  } catch (err) {
    return { error: (err as Error)?.message ?? 'Sign-in failed.' };
  }

  redirect(redirectTo);
  return { error: null };
}

export async function signUpWithPassword(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const redirectTo = sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/';

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }
  const policyError = validatePasswordPolicy(password);
  if (policyError) {
    return { error: policyError };
  }

  try {
    const gate = await checkEmailAllowedForAuth(email);
    if (!gate.allowed) {
      return { error: gate.error ?? 'Access denied.' };
    }

    const supabase = createSupabaseServerActionClient();
    const origin = getRequestOrigin();
    const loginParams = new URLSearchParams();
    loginParams.set('redirectTo', redirectTo);
    loginParams.set('email', email);
    loginParams.set('mode', 'signIn');
    const postConfirmRedirectTo = `/login?${loginParams.toString()}#existing-user`;
    const emailRedirectTo = origin
      ? `${origin}/auth/callback?flow=signup-confirm&redirectTo=${encodeURIComponent(postConfirmRedirectTo)}`
      : undefined;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined
    });
    if (error) {
      const normalized = error.message.toLowerCase();
      if (normalized.includes('already') && normalized.includes('registered')) {
        return { error: 'That email already has an account. Try signing in instead.', mode: 'signIn' };
      }
      return { error: error.message };
    }

    if (!data.user) {
      return { error: 'Sign-up failed. Please try again.' };
    }

    // Supabase may return a user with no identities when the email is already registered.
    // Avoid redirecting to the "check email" screen in that case (often no email is sent).
    if ((data.user.identities ?? []).length === 0) {
      return { error: 'That email already has an account. Try signing in instead.', mode: 'signIn' };
    }

    // If email confirmations are disabled, a session may be returned immediately.
    if (data.session) {
      redirect(redirectTo);
      return { error: null };
    }
  } catch (err) {
    return { error: (err as Error)?.message ?? 'Sign-up failed.' };
  }

  redirect(`/check-email?redirectTo=${encodeURIComponent(redirectTo)}&email=${encodeURIComponent(email)}`);
  return { error: null };
}

export async function signOut(): Promise<void> {
  try {
    const supabase = createSupabaseServerActionClient();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  redirect('/login?mode=signIn#existing-user');
}
