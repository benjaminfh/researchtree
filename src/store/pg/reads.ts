// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export interface PgBranchSummary {
  id: string;
  name: string;
  headCommit: string;
  nodeCount: number;
  isTrunk: boolean;
  isPinned: boolean;
  isHidden: boolean;
  provider?: string;
  model?: string;
  leaseHolderUserId?: string | null;
  leaseHolderSessionId?: string | null;
  leaseExpiresAt?: string | null;
}

export async function rtGetHistoryShadowV2(input: {
  projectId: string;
  refId: string;
  limit?: number;
  beforeOrdinal?: number | null;
  includeRawResponse?: boolean;
}): Promise<{ ordinal: number; nodeJson: unknown; createdOnRefId: string | null; mergeFromRefId: string | null }[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_history_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_limit: input.limit ?? 200,
    p_before_ordinal: input.beforeOrdinal ?? null,
    p_include_raw_response: input.includeRawResponse ?? false
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    ordinal: Number(row.ordinal),
    nodeJson: row.node_json,
    createdOnRefId: row.created_on_ref_id ? String(row.created_on_ref_id) : null,
    mergeFromRefId: row.merge_from_ref_id ? String(row.merge_from_ref_id) : null
  }));
}

export async function rtGetCanvasShadowV2(input: {
  projectId: string;
  refId: string;
  kind?: string;
}): Promise<{ content: string; contentHash: string; updatedAt: string | null; source: string }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_canvas_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_kind: input.kind ?? 'canvas_md'
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_get_canvas_v2');
  }
  return {
    content: String(row.content ?? ''),
    contentHash: String(row.content_hash ?? ''),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    source: String(row.source ?? 'unknown')
  };
}

export async function rtGetCanvasHashesShadowV2(input: {
  projectId: string;
  refId: string;
  kind?: string;
}): Promise<{ draftHash: string | null; artefactHash: string | null; draftUpdatedAt: string | null; artefactUpdatedAt: string | null }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_canvas_hashes_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_kind: input.kind ?? 'canvas_md'
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      draftHash: null,
      artefactHash: null,
      draftUpdatedAt: null,
      artefactUpdatedAt: null
    };
  }
  return {
    draftHash: row.draft_hash ? String(row.draft_hash) : null,
    artefactHash: row.artefact_hash ? String(row.artefact_hash) : null,
    draftUpdatedAt: row.draft_updated_at ? String(row.draft_updated_at) : null,
    artefactUpdatedAt: row.artefact_updated_at ? String(row.artefact_updated_at) : null
  };
}

export async function rtGetCanvasPairShadowV2(input: {
  projectId: string;
  refId: string;
  kind?: string;
}): Promise<{
  draftContent: string | null;
  draftHash: string | null;
  artefactContent: string | null;
  artefactHash: string | null;
  draftUpdatedAt: string | null;
  artefactUpdatedAt: string | null;
}> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_canvas_pair_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_kind: input.kind ?? 'canvas_md'
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      draftContent: null,
      draftHash: null,
      artefactContent: null,
      artefactHash: null,
      draftUpdatedAt: null,
      artefactUpdatedAt: null
    };
  }
  return {
    draftContent: row.draft_content ? String(row.draft_content) : null,
    draftHash: row.draft_hash ? String(row.draft_hash) : null,
    artefactContent: row.artefact_content ? String(row.artefact_content) : null,
    artefactHash: row.artefact_hash ? String(row.artefact_hash) : null,
    draftUpdatedAt: row.draft_updated_at ? String(row.draft_updated_at) : null,
    artefactUpdatedAt: row.artefact_updated_at ? String(row.artefact_updated_at) : null
  };
}

export async function rtListRefsShadowV2(input: { projectId: string }): Promise<PgBranchSummary[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_refs_v2', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    headCommit: String(row.head_commit ?? ''),
    nodeCount: Number(row.node_count ?? 0),
    isTrunk: Boolean(row.is_trunk),
    isPinned: Boolean(row.is_pinned),
    isHidden: Boolean(row.is_hidden),
    provider: row.provider ? String(row.provider) : undefined,
    model: row.model ? String(row.model) : undefined,
    leaseHolderUserId: row.lease_holder_user_id ? String(row.lease_holder_user_id) : null,
    leaseHolderSessionId: row.lease_holder_session_id ? String(row.lease_holder_session_id) : null,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at).toISOString() : null
  }));
}

export async function rtGetProjectMainRefUpdatesShadowV1(input: {
  projectIds: string[];
}): Promise<Array<{ projectId: string; updatedAt: string }>> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_project_main_ref_updates_v1', {
    p_project_ids: input.projectIds
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter((row) => row?.project_id && row?.updated_at)
    .map((row) => ({
      projectId: String(row.project_id),
      updatedAt: new Date(row.updated_at).toISOString()
    }));
}

export async function rtGetStarredNodeIdsShadowV1(input: { projectId: string }): Promise<string[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_starred_node_ids_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const ids = Array.isArray(data) ? data : (data as any);
  if (!ids) return [];
  // Supabase may return uuid[] as string[].
  return (ids as any[]).map((x) => String(x));
}
