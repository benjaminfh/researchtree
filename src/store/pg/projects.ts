import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtCreateProjectShadow(input: {
  projectId?: string;
  name: string;
  description?: string;
  provider?: string | null;
  model?: string | null;
}): Promise<{ projectId: string }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_create_project', {
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
