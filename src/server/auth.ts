// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import type { User } from '@supabase/supabase-js';
import { unauthorized } from '@/src/server/http';
import { createSupabaseAdminClient } from '@/src/server/supabase/admin';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { assertLocalPgModeConfig, isLocalPgMode } from '@/src/server/pgMode';
import { LOCAL_PG_USER_ID } from '@/src/server/localPgConfig';

const LOCAL_USER: User = {
  id: LOCAL_PG_USER_ID,
  email: 'local@device',
  app_metadata: {},
  user_metadata: {},
  aud: 'local',
  created_at: new Date(0).toISOString()
} as User;

const REGISTERED_ERROR_HINTS = ['already', 'registered'];

type WorkspaceInvitePayload = {
  project_id: string;
  project_name: string;
  invited_by?: string;
};

function looksLikeAlreadyRegistered(message: string): boolean {
  const normalized = message.toLowerCase();
  return REGISTERED_ERROR_HINTS.every((hint) => normalized.includes(hint));
}

export async function getUserOrNull(): Promise<User | null> {
  if (isLocalPgMode()) {
    assertLocalPgModeConfig();
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

export async function sendWorkspaceInviteEmailViaAuth(input: {
  recipientEmail: string;
  emailRedirectTo?: string;
  payload: WorkspaceInvitePayload;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.recipientEmail, {
    redirectTo: input.emailRedirectTo,
    data: input.payload
  });

  if (!inviteError) {
    return;
  }

  if (!looksLikeAlreadyRegistered(inviteError.message)) {
    throw new Error(inviteError.message);
  }

  const supabase = createSupabaseServerClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: input.recipientEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: input.emailRedirectTo,
      data: input.payload
    }
  });
  if (otpError) {
    throw new Error(otpError.message);
  }
}
