// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export type StoreMode = 'git' | 'pg';

export interface StoreConfig {
  mode: StoreMode;
}

export function getStoreConfig(): StoreConfig {
  const modeEnv = (process.env.RT_STORE ?? '').toLowerCase();
  if (modeEnv !== 'git' && modeEnv !== 'pg') {
    throw new Error('RT_STORE must be set to "git" or "pg"');
  }
  return { mode: modeEnv };
}
