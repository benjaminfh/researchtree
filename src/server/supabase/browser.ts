import { createBrowserClient } from '@supabase/ssr';
import { assertSupabaseConfigured } from './env';

export function createSupabaseBrowserClient() {
  const { url, anonKey } = assertSupabaseConfigured();
  return createBrowserClient(url, anonKey);
}

