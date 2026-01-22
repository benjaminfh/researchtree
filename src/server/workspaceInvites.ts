// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { sendWorkspaceInviteEmailViaAuth } from '@/src/server/auth';
import { getRequestOrigin } from '@/src/server/requestOrigin';

function buildInviteRedirect(projectId: string): string | undefined {
  const origin = getRequestOrigin();
  if (!origin) return undefined;
  const redirectTo = `/auth/invite?projectId=${encodeURIComponent(projectId)}`;
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

  await sendWorkspaceInviteEmailViaAuth({
    recipientEmail: input.recipientEmail,
    emailRedirectTo,
    payload: invitePayload
  });
}
