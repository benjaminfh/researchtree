import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtGetHistoryShadowV1(input: {
  projectId: string;
  refName: string;
  limit?: number;
}): Promise<{ ordinal: number; nodeJson: unknown }[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_get_history_v1', {
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
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_get_canvas_v1', {
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

