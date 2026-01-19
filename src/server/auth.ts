// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import type { User } from '@supabase/supabase-js';
import { unauthorized } from '@/src/server/http';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { assertLocalPgModeConfig, isLocalPgMode } from '@/src/server/pgMode';
import { LOCAL_PG_USER_ID } from '@/src/server/localPgConfig';
import { isPreviewDeployment } from '@/src/server/vercelEnv';

const LOCAL_USER: User = {
  id: LOCAL_PG_USER_ID,
  email: 'local@device',
  app_metadata: {},
  user_metadata: {},
  aud: 'local',
  created_at: new Date(0).toISOString()
} as User;

export async function getUserOrNull(): Promise<User | null> {
  if (isLocalPgMode()) {
    assertLocalPgModeConfig();
    return LOCAL_USER;
  }
  if (isPreviewDeployment()) {
    return LOCAL_USER;
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }
  return data.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getUserOrNull();
  if (!user) {
    throw unauthorized('Sign in required');
  }
  return user;
}
