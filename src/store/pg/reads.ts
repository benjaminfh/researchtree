import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export interface PgBranchSummary {
  name: string;
  headCommit: string;
  nodeCount: number;
  isTrunk: boolean;
  provider?: string;
  model?: string;
}

export async function rtGetHistoryShadowV1(input: {
  projectId: string;
  refName: string;
  limit?: number;
  includeRawResponse?: boolean;
}): Promise<{ ordinal: number; nodeJson: unknown }[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_history_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName,
    p_limit: input.limit ?? 200,
    p_include_raw_response: input.includeRawResponse ?? false
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    ordinal: Number(row.ordinal),
    nodeJson: row.node_json
  }));
}

export async function rtGetCanvasShadowV1(input: {
  projectId: string;
  refName: string;
}): Promise<{ content: string; contentHash: string; updatedAt: string | null; source: string }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_canvas_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_get_canvas_v1');
  }
  return {
    content: String(row.content ?? ''),
    contentHash: String(row.content_hash ?? ''),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    source: String(row.source ?? 'unknown')
  };
}

export async function rtGetCanvasHashesShadowV1(input: {
  projectId: string;
  refName: string;
}): Promise<{ draftHash: string | null; artefactHash: string | null; draftUpdatedAt: string | null; artefactUpdatedAt: string | null }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_canvas_hashes_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName
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

export async function rtGetCanvasPairShadowV1(input: {
  projectId: string;
  refName: string;
}): Promise<{
  draftContent: string | null;
  draftHash: string | null;
  artefactContent: string | null;
  artefactHash: string | null;
  draftUpdatedAt: string | null;
  artefactUpdatedAt: string | null;
}> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_canvas_pair_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName
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

export async function rtListRefsShadowV1(input: { projectId: string }): Promise<PgBranchSummary[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_refs_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    name: String(row.name),
    headCommit: String(row.head_commit ?? ''),
    nodeCount: Number(row.node_count ?? 0),
    isTrunk: Boolean(row.is_trunk),
    provider: row.provider ? String(row.provider) : undefined,
    model: row.model ? String(row.model) : undefined
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
