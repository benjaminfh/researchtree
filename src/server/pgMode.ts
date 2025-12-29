function isDesktopRuntime(): boolean {
  if (process.env.RT_DESKTOP !== '1') return false;
  const origin = process.env.RT_APP_ORIGIN ?? '';
  return origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:');
}

function hasSupabaseEnv(): boolean {
  if (isDesktopRuntime()) {
    return false;
  }
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
