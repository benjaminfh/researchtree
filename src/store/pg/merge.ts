// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtMergeOursShadowV1(input: {
  projectId: string;
  targetRefName: string;
  sourceRefName: string;
  mergeNodeId: string;
  mergeNodeJson: unknown;
  commitMessage?: string;
}): Promise<{ newCommitId: string; nodeId: string; ordinal: number }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_merge_ours_v1', {
    p_project_id: input.projectId,
    p_target_ref_name: input.targetRefName,
    p_source_ref_name: input.sourceRefName,
    p_merge_node_json: input.mergeNodeJson,
    p_merge_node_id: input.mergeNodeId,
    p_commit_message: input.commitMessage ?? null
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_merge_ours_v1');
  }

  return {
    newCommitId: String(row.new_commit_id),
    nodeId: String(row.node_id),
    ordinal: Number(row.ordinal)
  };
}
