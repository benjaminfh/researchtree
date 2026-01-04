// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['app', 'src', 'middleware.ts'];
const ALLOWED = new Set([
  'middleware.ts',
  'src/store/pg/adapter.ts',
  'src/server/supabase/server.ts',
  'src/server/supabase/admin.ts',
  'src/server/supabase/browser.ts',
  'src/server/auth.ts',
  'src/server/authz.ts',
  'src/server/waitlist.ts',
  'src/components/auth/AuthStatusPill.tsx',
  'app/login/actions.ts',
  'app/forgot-password/actions.ts',
  'app/reset-password/actions.ts',
  'app/auth/callback/route.ts',
  'app/auth/signout/route.ts',
  'app/api/profile/password/route.ts'
]);
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const SUPABASE_IMPORT_PATTERN = /@supabase\/(ssr|supabase-js|auth-helpers)/;
const FORBIDDEN_HELPERS = [
  'createSupabaseServerClient',
  'createSupabaseServerActionClient',
  'createSupabaseAdminClient',
  'createSupabaseBrowserClient'
];
const FORBIDDEN_GENERIC = ['createServerClient', 'createClient'];

async function gatherFiles(entry) {
  const fullPath = path.join(ROOT, entry);
  const stat = await fs.stat(fullPath);
  if (stat.isFile()) {
    return [fullPath];
  }
  if (!stat.isDirectory()) return [];
  const entries = await fs.readdir(fullPath);
  const results = [];
  for (const name of entries) {
    results.push(...(await gatherFiles(path.join(entry, name))));
  }
  return results;
}

function isTargetFile(filePath) {
  return TARGET_EXTENSIONS.has(path.extname(filePath));
}

function isAllowed(filePath) {
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
  return ALLOWED.has(rel);
}

async function main() {
  const files = [];
  for (const entry of SCAN_ROOTS) {
    files.push(...(await gatherFiles(entry)));
  }

  const violations = [];
  for (const filePath of files) {
    if (!isTargetFile(filePath) || isAllowed(filePath)) continue;
    const contents = await fs.readFile(filePath, 'utf8');
    const hasForbiddenHelpers = FORBIDDEN_HELPERS.some((needle) => contents.includes(needle));
    const hasSupabaseImport = SUPABASE_IMPORT_PATTERN.test(contents);
    const hasForbiddenGeneric = hasSupabaseImport && FORBIDDEN_GENERIC.some((needle) => contents.includes(needle));
    if (hasForbiddenHelpers || hasForbiddenGeneric) {
      const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');
      violations.push(rel);
    }
  }

  if (violations.length > 0) {
    console.error('Supabase client usage must stay behind the pg adapter boundary:');
    for (const file of violations) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Supabase usage check failed:', error);
  process.exit(1);
});
