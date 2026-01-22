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
  notificationLink?: string;
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

  if (!input.notificationLink) {
    throw new Error('Invitee is already registered but no notification link is available.');
  }

  await sendWorkspaceInviteNotificationEmail({
    recipientEmail: input.recipientEmail,
    inviteLink: input.notificationLink,
    projectName: input.payload.project_name,
    inviterEmail: input.payload.invited_by ?? null
  });
}

async function sendWorkspaceInviteNotificationEmail(input: {
  recipientEmail: string;
  inviteLink: string;
  projectName: string;
  inviterEmail: string | null;
}): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL ?? '').trim();
  if (!apiKey || !fromEmail) {
    throw new Error('Missing Resend email configuration for workspace invite notifications.');
  }

  const appName = (process.env.NEXT_PUBLIC_APP_NAME ?? 'threds').trim() || 'threds';
  const inviterLine = input.inviterEmail ? `${input.inviterEmail} invited you` : `You were invited`;
  const subject = `${input.inviterEmail ?? 'Someone'} invited you to ${input.projectName} on ${appName}`;
  const text = `${inviterLine} to join ${input.projectName}.\n\nOpen the workspace: ${input.inviteLink}`;
  const html = [
    `<p>${inviterLine} to join <strong>${input.projectName}</strong>.</p>`,
    `<p><a href="${input.inviteLink}">Open the workspace</a></p>`
  ].join('');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.recipientEmail],
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend invite notification failed: ${response.status} ${details}`);
  }
}
