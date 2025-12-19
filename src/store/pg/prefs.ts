import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtGetCurrentRefShadowV1(input: { projectId: string; defaultRefName?: string }): Promise<{ refName: string }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_get_current_ref_v1', {
    p_project_id: input.projectId,
    p_default_ref_name: input.defaultRefName ?? 'main'
  });
  if (error) {
    throw new Error(error.message);
  }
  return { refName: String(data ?? input.defaultRefName ?? 'main') };
}

export async function rtSetCurrentRefShadowV1(input: { projectId: string; refName: string }): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('rt_set_current_ref_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName
  });
  if (error) {
    throw new Error(error.message);
  }
}

