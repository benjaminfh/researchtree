// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export interface PgProjectMember {
  userId: string;
  email: string | null;
  role: string;
  createdAt: string;
}

export interface PgProjectInvite {
  id: string;
  email: string;
  role: string;
  invitedBy: string | null;
  invitedByEmail: string | null;
  createdAt: string;
}

export async function rtListProjectMemberIdsShadowV1(input: { userId: string }): Promise<string[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_project_member_ids_v1', {
    p_user_id: input.userId
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => String(row.project_id));
}

export async function rtListProjectMembersShadowV1(input: { projectId: string }): Promise<PgProjectMember[]> {
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
    email: row.email ? String(row.email) : null,
    role: String(row.role),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date(0).toISOString()
  }));
}

export async function rtListProjectInvitesShadowV1(input: { projectId: string }): Promise<PgProjectInvite[]> {
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
    role: String(row.role),
    invitedBy: row.invited_by ? String(row.invited_by) : null,
    invitedByEmail: row.invited_by_email ? String(row.invited_by_email) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date(0).toISOString()
  }));
}

export async function rtInviteProjectMemberShadowV1(input: {
  projectId: string;
  email: string;
  role: string;
}): Promise<{ inviteId: string | null; memberUserId: string | null }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_invite_project_member_v1', {
    p_project_id: input.projectId,
    p_email: input.email,
    p_role: input.role
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    inviteId: row?.invite_id ? String(row.invite_id) : null,
    memberUserId: row?.member_user_id ? String(row.member_user_id) : null
  };
}

export async function rtUpdateProjectMemberRoleShadowV1(input: {
  projectId: string;
  userId: string;
  role: string;
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

export async function rtUpdateProjectInviteRoleShadowV1(input: {
  projectId: string;
  inviteId: string;
  role: string;
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

export async function rtRevokeProjectInviteShadowV1(input: { projectId: string; inviteId: string }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_revoke_project_invite_v1', {
    p_project_id: input.projectId,
    p_invite_id: input.inviteId
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function rtAcceptProjectInvitesShadowV1(input: { email: string }): Promise<{ projectId: string; role: string }[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_accept_project_invites_v1', {
    p_email: input.email
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    projectId: String(row.project_id),
    role: String(row.role)
  }));
}
