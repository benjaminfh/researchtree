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
}): Promise<{ ordinal: number; nodeJson: unknown }[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_history_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName,
    p_limit: input.limit ?? 200
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
