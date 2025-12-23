import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtCreateProjectShadow(input: {
  projectId?: string;
  name: string;
  description?: string;
  provider?: string | null;
  model?: string | null;
}): Promise<{ projectId: string }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_create_project', {
    p_name: input.name,
    p_description: input.description ?? null,
    p_project_id: input.projectId ?? null,
    p_provider: input.provider ?? null,
    p_model: input.model ?? null
  });
  if (error) {
    throw new Error(error.message);
  }
  return { projectId: String(data) };
}
