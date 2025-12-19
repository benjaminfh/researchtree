import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtCreateRefFromNodeParentShadowV1(input: {
  projectId: string;
  sourceRefName: string;
  newRefName: string;
  nodeId: string;
}): Promise<{ baseCommitId: string | null; baseOrdinal: number }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_create_ref_from_node_parent_v1', {
    p_project_id: input.projectId,
    p_source_ref_name: input.sourceRefName,
    p_new_ref_name: input.newRefName,
    p_node_id: input.nodeId
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_create_ref_from_node_parent_v1');
  }

  return {
    baseCommitId: row.base_commit_id ? String(row.base_commit_id) : null,
    baseOrdinal: Number(row.base_ordinal)
  };
}

export async function rtCreateRefFromRefShadowV1(input: {
  projectId: string;
  fromRefName: string;
  newRefName: string;
}): Promise<{ baseCommitId: string | null; baseOrdinal: number }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_create_ref_from_ref_v1', {
    p_project_id: input.projectId,
    p_from_ref_name: input.fromRefName,
    p_new_ref_name: input.newRefName
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_create_ref_from_ref_v1');
  }

  return {
    baseCommitId: row.base_commit_id ? String(row.base_commit_id) : null,
    baseOrdinal: Number(row.base_ordinal)
  };
}
