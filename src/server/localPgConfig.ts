// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

const DEFAULT_LOCAL_PG_DB = 'threds';
export const LOCAL_PG_USER_ID = '00000000-0000-0000-0000-000000000001';
export const LOCAL_PG_USER_EMAIL = 'local@example.com';
const DEFAULT_LOCAL_PG_USER = process.env.USER ?? process.env.USERNAME ?? process.env.LOGNAME ?? '';

function ensureUsername(url: URL): void {
  if (url.username) return;
  if (DEFAULT_LOCAL_PG_USER) {
    url.username = DEFAULT_LOCAL_PG_USER;
  }
}

export function buildLocalPgConnectionString(connectionString: string, dbName: string): string {
  const url = new URL(connectionString);
  ensureUsername(url);
  url.pathname = `/${encodeURIComponent(dbName)}`;
  return url.toString();
}

export function getLocalPgConnectionStrings(): {
  baseUrl: string;
  dbName: string;
  connectionString: string;
  adminConnectionString: string;
} {
  const baseUrl = process.env.LOCAL_PG_URL;
  if (!baseUrl) {
    throw new Error('LOCAL_PG_URL is required to run local pg bootstrap');
  }
  const dbName = DEFAULT_LOCAL_PG_DB;
  return {
    baseUrl,
    dbName,
    connectionString: buildLocalPgConnectionString(baseUrl, dbName),
    adminConnectionString: buildLocalPgConnectionString(baseUrl, 'postgres')
  };
}
