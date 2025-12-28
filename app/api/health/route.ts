import { Pool } from 'pg';
import { isLocalPgMode } from '@/src/server/pgMode';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MigrationStatus = 'ok' | 'missing' | 'error' | 'unknown';

async function checkLocalPg(): Promise<{ reachable: boolean; migrationStatus: MigrationStatus; error?: string }> {
  const connectionString = process.env.LOCAL_PG_URL;
  if (!connectionString) {
    return { reachable: false, migrationStatus: 'missing', error: 'LOCAL_PG_URL not set' };
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 2000
  });

  try {
    const result = await pool.query(`select to_regclass('local_migrations') as name;`);
    const hasTable = Boolean(result.rows[0]?.name);
    return { reachable: true, migrationStatus: hasTable ? 'ok' : 'missing' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local PG check failed';
    return { reachable: false, migrationStatus: 'error', error: message };
  } finally {
    await pool.end();
  }
}

export async function GET() {
  const storageMode = {
    store: process.env.RT_STORE ?? 'git',
    pg_adapter: process.env.RT_PG_ADAPTER ?? 'supabase'
  };

  let dbReachable: boolean | null = null;
  let migrationStatus: MigrationStatus = 'unknown';
  let error: string | null = null;

  if (isLocalPgMode()) {
    const result = await checkLocalPg();
    dbReachable = result.reachable;
    migrationStatus = result.migrationStatus;
    error = result.error ?? null;
  }

  const ok = isLocalPgMode() ? Boolean(dbReachable && migrationStatus === 'ok') : true;

  return Response.json(
    {
      ok,
      storage_mode: storageMode,
      db_reachable: dbReachable,
      migration_status: migrationStatus,
      error
    },
    { status: ok ? 200 : 503 }
  );
}
