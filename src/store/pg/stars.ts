import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtToggleStarV1(input: { projectId: string; nodeId: string }): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_toggle_star_v1', {
    p_project_id: input.projectId,
    p_node_id: input.nodeId
  });
  if (error) {
    throw new Error(error.message);
  }
  const ids = Array.isArray(data) ? data : (data as any);
  if (!ids) return [];
  return (ids as any[]).map((x) => String(x));
}
