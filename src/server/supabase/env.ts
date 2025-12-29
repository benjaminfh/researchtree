// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

function readEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

export function getSupabaseUrl(): string | null {
  return readEnv('NEXT_PUBLIC_SUPABASE_URL');
}

export function getSupabaseAnonKey(): string | null {
  return readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export function getSupabaseServiceRoleKey(): string | null {
  return readEnv('SUPABASE_SERVICE_ROLE_KEY');
}

export function assertSupabaseConfigured(): { url: string; anonKey: string } {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error('Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return { url, anonKey };
}

