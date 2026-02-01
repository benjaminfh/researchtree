// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtAppendNodeToRefShadowV2(input: {
  projectId: string;
  refId: string;
  kind: string;
  role: string | null | undefined;
  contentJson: unknown;
  nodeId: string;
  commitMessage?: string;
  attachDraft?: boolean;
  rawResponse?: unknown;
  clientRequestId?: string;
}): Promise<{ newCommitId: string; nodeId: string; ordinal: number; artefactId: string | null; artefactContentHash: string | null }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_append_node_to_ref_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_kind: input.kind,
    p_role: input.role ?? 'system',
    p_content_json: input.contentJson,
    p_node_id: input.nodeId,
    p_commit_message: input.commitMessage ?? null,
    p_attach_draft: input.attachDraft ?? false,
    p_artefact_kind: 'canvas_md',
    p_lock_timeout_ms: 3000,
    p_raw_response: input.rawResponse ?? null,
    p_client_request_id: input.clientRequestId ?? null
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_append_node_to_ref_v2');
  }

  return {
    newCommitId: String(row.new_commit_id),
    nodeId: String(row.node_id),
    ordinal: Number(row.ordinal),
    artefactId: row.artefact_id ? String(row.artefact_id) : null,
    artefactContentHash: row.artefact_content_hash ? String(row.artefact_content_hash) : null
  };
}

export async function rtGetNodeContentShadowV1(input: {
  projectId: string;
  nodeId: string;
}): Promise<unknown | null> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_node_content_json_v1', {
    p_project_id: input.projectId,
    p_node_id: input.nodeId
  });
  if (error) {
    throw new Error(error.message);
  }
  return data ?? null;
}
