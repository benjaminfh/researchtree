'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/src/server/supabase/server';

type AuthActionState = { error: string | null };

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
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }
  } catch (err) {
    return { error: (err as Error)?.message ?? 'Sign-in failed.' };
  }

  redirect(redirectTo);
}

export async function signUpWithPassword(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const redirectTo = sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/';

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { error: error.message };
    }
  } catch (err) {
    return { error: (err as Error)?.message ?? 'Sign-up failed.' };
  }

  redirect(redirectTo);
}

export async function signOut(): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  redirect('/login');
}
