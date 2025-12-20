import type { User } from '@supabase/supabase-js';
import { unauthorized } from '@/src/server/http';
import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function getUserOrNull(): Promise<User | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }
  return data.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getUserOrNull();
  if (!user) {
    throw unauthorized('Sign in required');
  }
  return user;
}

