import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtCreateProjectShadow(input: {
  projectId?: string;
  name: string;
  description?: string;
}): Promise<{ projectId: string }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_create_project', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_project_id: input.projectId ?? null
  });
  if (error) {
    throw new Error(error.message);
  }
  return { projectId: String(data) };
}
