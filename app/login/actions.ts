'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';

type AuthActionState = { error: string | null };

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

  try {
    const supabase = createSupabaseServerActionClient();
    const origin = getRequestOrigin();
    const emailRedirectTo = origin ? `${origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}` : undefined;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined
    });
    if (error) {
      return { error: error.message };
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
  redirect('/login');
}
