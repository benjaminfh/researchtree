import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'supabase', 'migrations');
const MIGRATIONS_TABLE = 'local_migrations';

let bootstrapPromise: Promise<void> | null = null;

function shouldWrapInTransaction(sql: string): boolean {
  const normalized = sql.toLowerCase();
  return !/\b(begin|commit|rollback)\b/.test(normalized);
}

function getDatabaseName(connectionString: string): string {
  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName) {
    throw new Error('LOCAL_PG_URL must include a database name');
  }
  return dbName;
}

function getAdminConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  return url.toString();
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function isMissingDatabaseError(error: any): boolean {
  const message = typeof error?.message === 'string' ? error.message : '';
  return error?.code === '3D000' || message.includes('does not exist');
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists ${MIGRATIONS_TABLE} (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query(`select name from ${MIGRATIONS_TABLE};`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function applyMigration(pool: Pool, name: string, sql: string): Promise<void> {
  const wrap = shouldWrapInTransaction(sql);
  if (wrap) {
    await pool.query('begin');
  }
  try {
    await pool.query(sql);
    await pool.query(`insert into ${MIGRATIONS_TABLE} (name) values ($1);`, [name]);
    if (wrap) {
      await pool.query('commit');
    }
  } catch (error) {
    if (wrap) {
      await pool.query('rollback');
    }
    throw error;
  }
}

async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const dbName = getDatabaseName(connectionString);
  const adminConnectionString = getAdminConnectionString(connectionString);
  const adminPool = new Pool({ connectionString: adminConnectionString });
  try {
    await adminPool.query(`create database ${quoteIdentifier(dbName)};`);
  } catch (error: any) {
    if (error?.code !== '42P04') {
      throw error;
    }
  } finally {
    await adminPool.end();
  }
}

async function bootstrapLocalPg(): Promise<void> {
  const connectionString = process.env.LOCAL_PG_URL;
  if (!connectionString) {
    throw new Error('LOCAL_PG_URL is required to run local pg bootstrap');
  }

  let pool = new Pool({ connectionString });

  try {
    try {
      await ensureMigrationsTable(pool);
    } catch (error) {
      if (!isMissingDatabaseError(error)) {
        throw error;
      }
      await ensureDatabaseExists(connectionString);
      await pool.end();
      pool = new Pool({ connectionString });
      await ensureMigrationsTable(pool);
    }
    const applied = await getAppliedMigrations(pool);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const fullPath = path.join(MIGRATIONS_DIR, file);
      const sql = await readFile(fullPath, 'utf8');
      await applyMigration(pool, file, sql);
    }
  } finally {
    await pool.end();
  }
}

export async function maybeBootstrapLocalPg(): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  const toggle = (process.env.RT_PG_BOOTSTRAP ?? '1').toLowerCase();
  if (toggle === '0' || toggle === 'false') return;
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapLocalPg();
  }
  return bootstrapPromise;
}
