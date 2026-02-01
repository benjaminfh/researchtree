// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { getLocalPgConnectionStrings, LOCAL_PG_USER_ID } from '@/src/server/localPgConfig';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveMigrationsDir(): string {
  if (process.env.RT_MIGRATIONS_DIR) {
    return process.env.RT_MIGRATIONS_DIR;
  }
  return path.resolve(__dirname, '..', '..', 'supabase', 'migrations');
}

const MIGRATIONS_DIR = resolveMigrationsDir();
const MIGRATIONS_TABLE = 'local_migrations';

let bootstrapPromise: Promise<void> | null = null;

function shouldWrapInTransaction(sql: string): boolean {
  const normalized = sql.toLowerCase();
  return !/\b(begin|commit|rollback)\b/.test(normalized);
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

const LOCAL_PG_ROLES = ['anon', 'authenticated', 'service_role'] as const;

async function ensureLocalRoles(pool: Pool): Promise<void> {
  for (const role of LOCAL_PG_ROLES) {
    const result = await pool.query('select 1 from pg_roles where rolname = $1;', [role]);
    if ((result.rowCount ?? 0) === 0) {
      await pool.query(`create role ${quoteIdentifier(role)};`);
    }
  }
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists ${MIGRATIONS_TABLE} (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function ensureLocalSchemas(pool: Pool): Promise<void> {
  await pool.query('create schema if not exists auth;');
  await pool.query(
    `
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      created_at timestamptz not null default now()
    );
  `
  );
  await pool.query(
    `
    insert into auth.users (id, email)
    values ($1, $2)
    on conflict (id) do update
      set email = excluded.email
  `,
    [LOCAL_PG_USER_ID, 'local@example.com']
  );
  await pool.query(
    `
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select '${LOCAL_PG_USER_ID}'::uuid
    $$;
  `
  );
  await pool.query(
    `
    create or replace function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select jsonb_build_object('email', 'local@example.com')
    $$;
  `
  );
  await pool.query('create schema if not exists extensions;');
  await pool.query('create extension if not exists pgcrypto;');
  await pool.query(
    `
    create or replace function extensions.digest(data bytea, type text)
    returns bytea
    language sql
    immutable
    as $$
      select public.digest(data, type)
    $$;
  `
  );
  await pool.query('create schema if not exists vault;');
  await pool.query(
    `
    create table if not exists vault.secrets (
      id uuid primary key default gen_random_uuid(),
      secret text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `
  );
  await pool.query(
    `
    create or replace function vault.create_secret(p_secret text)
    returns uuid
    language plpgsql
    as $$
    declare
      v_id uuid;
    begin
      insert into vault.secrets (secret)
      values (p_secret)
      returning id into v_id;
      return v_id;
    end;
    $$;
  `
  );
  await pool.query(
    `
    create or replace function vault.update_secret(p_id uuid, p_secret text)
    returns void
    language plpgsql
    as $$
    begin
      update vault.secrets
      set secret = p_secret,
          updated_at = now()
      where id = p_id;
    end;
    $$;
  `
  );
  await pool.query(
    `
    create or replace function vault.delete_secret(p_id uuid)
    returns void
    language plpgsql
    as $$
    begin
      delete from vault.secrets
      where id = p_id;
    end;
    $$;
  `
  );
  await pool.query(
    `
    create or replace function vault.decrypt_secret(p_id uuid)
    returns text
    language sql
    stable
    as $$
      select secret from vault.secrets where id = p_id
    $$;
  `
  );
  await pool.query(
    `
    create or replace function vault.read_secret(p_id uuid)
    returns jsonb
    language sql
    stable
    as $$
      select jsonb_build_object('secret', secret) from vault.secrets where id = p_id
    $$;
  `
  );
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

async function ensureDatabaseExists(adminPool: Pool, dbName: string): Promise<void> {
  try {
    const existing = await adminPool.query('select 1 from pg_database where datname = $1;', [dbName]);
    if ((existing.rowCount ?? 0) > 0) {
      return;
    }
    await adminPool.query(`create database ${quoteIdentifier(dbName)};`);
  } catch (error: any) {
    if (error?.code === '42P04') return;
    throw error;
  }
}

async function bootstrapLocalPg(): Promise<void> {
  const { connectionString, adminConnectionString, dbName } = getLocalPgConnectionStrings();
  const adminPool = new Pool({ connectionString: adminConnectionString });
  try {
    await ensureLocalRoles(adminPool);
    await ensureDatabaseExists(adminPool, dbName);
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({ connectionString });

  try {
    await ensureLocalSchemas(pool);
    await ensureMigrationsTable(pool);
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
