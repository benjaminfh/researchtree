// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtMergeOursShadowV2(input: {
  projectId: string;
  targetRefId: string;
  sourceRefId: string;
  mergeNodeId: string;
  mergeNodeJson: unknown;
  commitMessage?: string;
  lockTimeoutMs?: number;
}): Promise<{ newCommitId: string; nodeId: string; ordinal: number }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_merge_ours_v2', {
    p_project_id: input.projectId,
    p_target_ref_id: input.targetRefId,
    p_source_ref_id: input.sourceRefId,
    p_merge_node_json: input.mergeNodeJson,
    p_merge_node_id: input.mergeNodeId,
    p_commit_message: input.commitMessage ?? null,
    p_lock_timeout_ms: input.lockTimeoutMs ?? 3000
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_merge_ours_v2');
  }

  return {
    newCommitId: String(row.new_commit_id),
    nodeId: String(row.node_id),
    ordinal: Number(row.ordinal)
  };
}
