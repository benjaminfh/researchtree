// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getRequestOrigin } from '@/src/server/requestOrigin';
import { approveEmail } from '@/src/server/waitlist';

function buildProjectLink(projectId: string): string | undefined {
  const origin = getRequestOrigin();
  if (!origin) return undefined;
  return `${origin}/projects/${encodeURIComponent(projectId)}`;
}

function buildRegistrationLink(projectId: string, recipientEmail: string): string | undefined {
  const origin = getRequestOrigin();
  if (!origin) return undefined;
  const redirectTo = `/projects/${encodeURIComponent(projectId)}`;
  const loginParams = new URLSearchParams({
    redirectTo,
    email: recipientEmail,
    mode: 'signUp'
  });
  return `${origin}/login?${loginParams.toString()}`;
}

export async function sendWorkspaceInviteEmail(input: {
  projectId: string;
  projectName: string;
  recipientEmail: string;
  inviterEmail: string | null;
  isExistingUser: boolean;
}): Promise<void> {
  if (!input.isExistingUser) {
    await approveEmail(input.recipientEmail, input.inviterEmail);
  }

  const inviteLink = input.isExistingUser
    ? buildProjectLink(input.projectId)
    : buildRegistrationLink(input.projectId, input.recipientEmail);

  if (!inviteLink) {
    throw new Error('Workspace invite email requires a valid application origin.');
  }

  await sendWorkspaceInviteNotificationEmail({
    recipientEmail: input.recipientEmail,
    inviteLink,
    projectName: input.projectName,
    inviterEmail: input.inviterEmail,
    isExistingUser: input.isExistingUser
  });
}

async function sendWorkspaceInviteNotificationEmail(input: {
  recipientEmail: string;
  inviteLink: string;
  projectName: string;
  inviterEmail: string | null;
  isExistingUser: boolean;
}): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL ?? '').trim();
  if (!apiKey || !fromEmail) {
    throw new Error('Missing Resend email configuration for workspace invite notifications.');
  }

  const appName = (process.env.NEXT_PUBLIC_APP_NAME ?? 'threds').trim() || 'threds';
  const inviterLine = input.inviterEmail ? `${input.inviterEmail} invited you` : `You were invited`;
  const subject = `${input.inviterEmail ?? 'Someone'} invited you to ${input.projectName} on ${appName}`;
  const actionLine = input.isExistingUser ? 'Open the workspace' : 'Create your account to access the workspace';
  const text = `${inviterLine} to join ${input.projectName}.\n\n${actionLine}: ${input.inviteLink}`;
  const html = [
    `<p>${inviterLine} to join <strong>${input.projectName}</strong>.</p>`,
    `<p><a href="${input.inviteLink}">${actionLine}</a></p>`
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
