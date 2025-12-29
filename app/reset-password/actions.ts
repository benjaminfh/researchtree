// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';

type ResetPasswordActionState = { error: string | null };

function sanitizeRedirectTo(input: string | null): string | null {
  if (!input) return null;
  if (!input.startsWith('/')) return null;
  if (input.startsWith('//')) return null;
  return input;
}

export async function updatePassword(
  _prevState: ResetPasswordActionState,
  formData: FormData
): Promise<ResetPasswordActionState> {
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');
  const redirectTo = sanitizeRedirectTo(String(formData.get('redirectTo') ?? '').trim()) ?? '/';

  if (!password) return { error: 'Password is required.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (password !== confirmPassword) return { error: 'Passwords do not match.' };

  try {
    const supabase = createSupabaseServerActionClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return { error: 'Open the password reset link from your email to continue.' };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return { error: error.message };
    }
  } catch {
    return { error: 'Unable to update password. Please try again.' };
  }

  redirect(redirectTo);
  return { error: null };
}

