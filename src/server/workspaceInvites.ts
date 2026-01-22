// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { createSupabaseAdminClient } from '@/src/server/supabase/admin';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { getRequestOrigin } from '@/src/server/requestOrigin';

const REGISTERED_ERROR_HINTS = ['already', 'registered'];

function looksLikeAlreadyRegistered(message: string): boolean {
  const normalized = message.toLowerCase();
  return REGISTERED_ERROR_HINTS.every((hint) => normalized.includes(hint));
}

function buildInviteRedirect(projectId: string): string | undefined {
  const origin = getRequestOrigin();
  if (!origin) return undefined;
  const redirectTo = `/projects/${projectId}`;
  return `${origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export async function sendWorkspaceInviteEmail(input: {
  projectId: string;
  projectName: string;
  recipientEmail: string;
  inviterEmail: string | null;
}): Promise<void> {
  const emailRedirectTo = buildInviteRedirect(input.projectId);
  const invitePayload = {
    project_id: input.projectId,
    project_name: input.projectName,
    invited_by: input.inviterEmail ?? undefined
  };

  const admin = createSupabaseAdminClient();
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.recipientEmail, {
    redirectTo: emailRedirectTo,
    data: invitePayload
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
      emailRedirectTo,
      data: invitePayload
    }
  });
  if (otpError) {
    throw new Error(otpError.message);
  }
}
