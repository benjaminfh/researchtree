// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { assertSupabaseConfigured, getSupabaseSecretKey } from './env';
import { isCodexDev, isPreviewDeployment } from '@/src/server/deploymentEnv';

export function createSupabaseServerClient() {
  warnIfCodexSchemaMayDrift();
  const { url, anonKey } = assertSupabaseConfigured();
  const previewSecretKey = isPreviewDeployment() ? getSupabaseSecretKey() : null;
  const apiKey = previewSecretKey ?? anonKey;
  const cookieStore = cookies();

  return createServerClient(url, apiKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        if (!('set' in cookieStore)) return;
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options as CookieOptions);
          } catch {
            // ignore when called from read-only contexts
          }
        }
      }
    }
  });
}

export function createSupabaseServerActionClient() {
  const { url, anonKey } = assertSupabaseConfigured();
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options as CookieOptions);
        }
      }
    }
  });
}

let codexSchemaWarningIssued = false;

function warnIfCodexSchemaMayDrift() {
  if (!isCodexDev() || codexSchemaWarningIssued) return;
  codexSchemaWarningIssued = true;
  console.warn(
    '[codex] Using static Supabase credentials may cause schema drift versus feature branches. Apply migrations if preview errors appear.'
  );
}
