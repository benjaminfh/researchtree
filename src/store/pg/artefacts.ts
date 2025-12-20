import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtUpdateArtefactShadow(input: {
  projectId: string;
  refName: string;
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
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_update_artefact_on_ref', {
    p_project_id: input.projectId,
    p_ref_name: input.refName,
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
    throw new Error('No data returned from rt_update_artefact_on_ref');
  }

  return {
    newCommitId: String(row.new_commit_id),
    artefactId: String(row.artefact_id),
    stateNodeId: row.state_node_id ? String(row.state_node_id) : null,
    ordinal: Number(row.ordinal),
    contentHash: String(row.content_hash)
  };
}

