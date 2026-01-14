// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export type ProjectMemberRole = 'owner' | 'editor' | 'viewer';

export interface ProjectMemberSummary {
  userId: string;
  role: ProjectMemberRole;
  createdAt: string;
}

export interface ProjectInviteSummary {
  id: string;
  email: string;
  role: ProjectMemberRole;
  invitedBy: string;
  createdAt: string;
  acceptedUserId: string | null;
  acceptedAt: string | null;
}

export async function rtGetProjectMemberRoleShadowV1(input: { projectId: string }): Promise<ProjectMemberRole | null> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_project_member_role_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return String((data as any).result ?? data) as ProjectMemberRole;
}

export async function rtListProjectMembersShadowV1(input: { projectId: string }): Promise<ProjectMemberSummary[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_project_members_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    userId: String(row.user_id),
    role: String(row.role) as ProjectMemberRole,
    createdAt: new Date(row.created_at).toISOString()
  }));
}

export async function rtListProjectInvitesShadowV1(input: { projectId: string }): Promise<ProjectInviteSummary[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_project_invites_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    id: String(row.id),
    email: String(row.email),
    role: String(row.role) as ProjectMemberRole,
    invitedBy: String(row.invited_by),
    createdAt: new Date(row.created_at).toISOString(),
    acceptedUserId: row.accepted_user_id ? String(row.accepted_user_id) : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null
  }));
}

export async function rtShareProjectByEmailShadowV1(input: {
  projectId: string;
  email: string;
  role: ProjectMemberRole;
}): Promise<{ inviteId: string; resolvedUserId: string | null; role: ProjectMemberRole; accepted: boolean }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_share_project_by_email_v1', {
    p_project_id: input.projectId,
    p_email: input.email,
    p_role: input.role
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_share_project_by_email_v1');
  }
  return {
    inviteId: String(row.invite_id),
    resolvedUserId: row.resolved_user_id ? String(row.resolved_user_id) : null,
    role: String(row.role) as ProjectMemberRole,
    accepted: Boolean(row.accepted)
  };
}

export async function rtUpdateProjectMemberRoleShadowV1(input: {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
}): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_update_project_member_role_v1', {
    p_project_id: input.projectId,
    p_user_id: input.userId,
    p_role: input.role
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function rtRemoveProjectMemberShadowV1(input: { projectId: string; userId: string }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_remove_project_member_v1', {
    p_project_id: input.projectId,
    p_user_id: input.userId
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function rtRemoveProjectInviteShadowV1(input: { projectId: string; inviteId: string }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_remove_project_invite_v1', {
    p_project_id: input.projectId,
    p_invite_id: input.inviteId
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function rtUpdateProjectInviteRoleShadowV1(input: {
  projectId: string;
  inviteId: string;
  role: ProjectMemberRole;
}): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_update_project_invite_role_v1', {
    p_project_id: input.projectId,
    p_invite_id: input.inviteId,
    p_role: input.role
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function rtAcceptProjectInvitesShadowV1(): Promise<Array<{ projectId: string; role: ProjectMemberRole }>> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_accept_project_invites_v1');
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    projectId: String(row.project_id),
    role: String(row.role) as ProjectMemberRole
  }));
}
