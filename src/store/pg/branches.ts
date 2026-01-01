// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtCreateRefFromNodeParentShadowV2(input: {
  projectId: string;
  sourceRefId: string;
  newRefName: string;
  nodeId: string;
  provider?: string | null;
  model?: string | null;
  previousResponseId?: string | null;
  lockTimeoutMs?: number;
}): Promise<{ baseCommitId: string | null; baseOrdinal: number }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_create_ref_from_node_parent_v2', {
    p_project_id: input.projectId,
    p_source_ref_id: input.sourceRefId,
    p_new_ref_name: input.newRefName,
    p_node_id: input.nodeId,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_previous_response_id: input.previousResponseId ?? null,
    p_lock_timeout_ms: input.lockTimeoutMs ?? 3000
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_create_ref_from_node_parent_v2');
  }

  return {
    baseCommitId: row.base_commit_id ? String(row.base_commit_id) : null,
    baseOrdinal: Number(row.base_ordinal)
  };
}

export async function rtCreateRefFromNodeShadowV2(input: {
  projectId: string;
  sourceRefId: string;
  newRefName: string;
  nodeId: string;
  provider?: string | null;
  model?: string | null;
  previousResponseId?: string | null;
  lockTimeoutMs?: number;
}): Promise<{ baseCommitId: string | null; baseOrdinal: number }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_create_ref_from_node_v2', {
    p_project_id: input.projectId,
    p_source_ref_id: input.sourceRefId,
    p_new_ref_name: input.newRefName,
    p_node_id: input.nodeId,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_previous_response_id: input.previousResponseId ?? null,
    p_lock_timeout_ms: input.lockTimeoutMs ?? 3000
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_create_ref_from_node_v2');
  }

  return {
    baseCommitId: row.base_commit_id ? String(row.base_commit_id) : null,
    baseOrdinal: Number(row.base_ordinal)
  };
}

export async function rtCreateRefFromRefShadowV2(input: {
  projectId: string;
  fromRefId: string;
  newRefName: string;
  provider?: string | null;
  model?: string | null;
  previousResponseId?: string | null;
  lockTimeoutMs?: number;
}): Promise<{ baseCommitId: string | null; baseOrdinal: number }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_create_ref_from_ref_v2', {
    p_project_id: input.projectId,
    p_from_ref_id: input.fromRefId,
    p_new_ref_name: input.newRefName,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null,
    p_previous_response_id: input.previousResponseId ?? null,
    p_lock_timeout_ms: input.lockTimeoutMs ?? 3000
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_create_ref_from_ref_v2');
  }

  return {
    baseCommitId: row.base_commit_id ? String(row.base_commit_id) : null,
    baseOrdinal: Number(row.base_ordinal)
  };
}

export async function rtRenameRefShadowV2(input: {
  projectId: string;
  refId: string;
  newName: string;
  lockTimeoutMs?: number;
}): Promise<{ refId: string; refName: string }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_rename_ref_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_new_name: input.newName,
    p_lock_timeout_ms: input.lockTimeoutMs ?? 3000
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_rename_ref_v2');
  }

  return {
    refId: String(row.ref_id),
    refName: String(row.ref_name)
  };
}

export async function rtSetPinnedRefShadowV2(input: { projectId: string; refId: string }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_set_pinned_ref_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function rtClearPinnedRefShadowV2(input: { projectId: string }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_clear_pinned_ref_v2', {
    p_project_id: input.projectId
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function rtGetPinnedRefShadowV2(input: {
  projectId: string;
}): Promise<{ refId: string | null; refName: string | null }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_pinned_ref_v2', {
    p_project_id: input.projectId
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    refId: row?.ref_id ? String(row.ref_id) : null,
    refName: row?.ref_name ? String(row.ref_name) : null
  };
}
