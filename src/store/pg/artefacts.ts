// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtUpdateArtefactShadowV2(input: {
  projectId: string;
  refId: string;
  content: string;
  stateNodeId?: string | null;
  stateNodeJson?: unknown | null;
  commitMessage?: string | null;
}): Promise<{
  newCommitId: string;
  artefactId: string;
  stateNodeId: string | null;
  ordinal: number;
  contentHash: string;
}> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_update_artefact_on_ref_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_content: input.content ?? '',
    p_kind: 'canvas_md',
    p_state_node_id: input.stateNodeId ?? null,
    p_state_node_json: input.stateNodeJson ?? null,
    p_commit_message: input.commitMessage ?? null,
    p_lock_timeout_ms: 3000
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_update_artefact_on_ref_v2');
  }

  return {
    newCommitId: String(row.new_commit_id),
    artefactId: String(row.artefact_id),
    stateNodeId: row.state_node_id ? String(row.state_node_id) : null,
    ordinal: Number(row.ordinal),
    contentHash: String(row.content_hash)
  };
}
