import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtToggleStarShadow(input: { projectId: string; nodeId: string }): Promise<{ starred: boolean }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_toggle_star', {
    p_project_id: input.projectId,
    p_node_id: input.nodeId
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_toggle_star');
  }
  return { starred: Boolean(row.starred) };
}

export async function rtSyncStarsShadow(input: { projectId: string; nodeIds: string[] }): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('rt_sync_stars', {
    p_project_id: input.projectId,
    p_node_ids: input.nodeIds
  });
  if (error) {
    throw new Error(error.message);
  }
}
