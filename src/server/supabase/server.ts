// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { assertSupabaseConfigured } from './env';

export function createSupabaseServerClient() {
  const { url, anonKey } = assertSupabaseConfigured();
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        if (!('set' in cookieStore)) return;
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options as CookieOptions);
          } catch {
            // ignore when called from read-only contexts
          }
        }
      }
    }
  });
}

export function createSupabaseServerActionClient() {
  const { url, anonKey } = assertSupabaseConfigured();
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options as CookieOptions);
        }
      }
    }
  });
}
