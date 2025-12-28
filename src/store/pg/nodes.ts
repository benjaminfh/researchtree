import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtAppendNodeToRefShadowV1(input: {
  projectId: string;
  refName: string;
  kind: string;
  role: string | null | undefined;
  contentJson: unknown;
  nodeId: string;
  commitMessage?: string;
  attachDraft?: boolean;
  rawResponse?: unknown;
}): Promise<{ newCommitId: string; nodeId: string; ordinal: number; artefactId: string | null; artefactContentHash: string | null }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_append_node_to_ref_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName,
    p_kind: input.kind,
    p_role: input.role ?? 'system',
    p_content_json: input.contentJson,
    p_node_id: input.nodeId,
    p_commit_message: input.commitMessage ?? null,
    p_attach_draft: input.attachDraft ?? false,
    p_raw_response: input.rawResponse ?? null
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_append_node_to_ref_v1');
  }

  return {
    newCommitId: String(row.new_commit_id),
    nodeId: String(row.node_id),
    ordinal: Number(row.ordinal),
    artefactId: row.artefact_id ? String(row.artefact_id) : null,
    artefactContentHash: row.artefact_content_hash ? String(row.artefact_content_hash) : null
  };
}
