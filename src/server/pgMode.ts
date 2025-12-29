function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function isLocalPgMode(): boolean {
  return process.env.RT_PG_ADAPTER === 'local';
}

export function assertLocalPgModeConfig(): void {
  if (!isLocalPgMode()) return;
  if (hasSupabaseEnv()) {
    throw new Error('RT_PG_ADAPTER=local cannot be used with Supabase env vars present');
  }
  if (!process.env.LOCAL_PG_URL) {
    throw new Error('RT_PG_ADAPTER=local requires LOCAL_PG_URL');
  }
}
