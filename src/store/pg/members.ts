// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

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

export interface ProjectMemberSummary {
  userId: string;
  role: string;
  createdAt: string;
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
    role: String(row.role ?? ''),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date(0).toISOString()
  }));
}

export interface ProjectInviteSummary {
  email: string;
  role: string;
  invitedByUserId: string;
  createdAt: string;
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
    email: String(row.email ?? ''),
    role: String(row.role ?? ''),
    invitedByUserId: String(row.invited_by_user_id ?? ''),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date(0).toISOString()
  }));
}
