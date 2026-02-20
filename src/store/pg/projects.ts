// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export interface PgProjectSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  ownerUserId?: string;
  ownerEmail?: string;
  systemPrompt?: string;
}

export async function rtCreateProjectShadow(input: {
  projectId?: string;
  name: string;
  description?: string;
  provider?: string | null;
  model?: string | null;
  systemPrompt?: string | null;
}): Promise<{ projectId: string }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_create_project', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_project_id: input.projectId ?? null,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_system_prompt: input.systemPrompt ?? null
  });
  if (error) {
    throw new Error(error.message);
  }
  return { projectId: String(data) };
}

export async function rtListProjectsShadowV1(): Promise<PgProjectSummary[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_projects_v1');
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at ?? row.created_at).toISOString(),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : undefined,
    ownerEmail: row.owner_email ?? undefined,
    systemPrompt: row.system_prompt ? String(row.system_prompt) : undefined
  }));
}

export async function rtGetProjectShadowV1(input: { projectId: string }): Promise<PgProjectSummary | null> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_project_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at ?? row.created_at).toISOString(),
    systemPrompt: row.system_prompt ? String(row.system_prompt) : undefined
  };
}

export async function rtGetProjectOwnerShadowV1(input: { projectId: string }): Promise<string | null> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_project_owner_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row?.owner_user_id ? String(row.owner_user_id) : null;
}
