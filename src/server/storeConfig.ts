export type StoreMode = 'git' | 'pg';

export interface StoreConfig {
  mode: StoreMode;
  readFromPg: boolean;
  shadowWriteToPg: boolean;
  usePgPrefs: boolean;
}

function parseBool(value: string | undefined): boolean {
  return (value ?? '').toLowerCase() === 'true';
}

export function getStoreConfig(): StoreConfig {
  const modeEnv = (process.env.RT_STORE ?? '').toLowerCase();
  const shadowWrite = parseBool(process.env.RT_SHADOW_WRITE);

  const mode: StoreMode = modeEnv === 'pg' ? 'pg' : 'git';

  return {
    mode,
    readFromPg: mode === 'pg',
    shadowWriteToPg: mode === 'git' && shadowWrite,
    usePgPrefs: mode === 'pg' || shadowWrite
  };
}
