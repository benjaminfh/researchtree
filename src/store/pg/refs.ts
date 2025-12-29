import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtGetRefPreviousResponseIdV1(input: { projectId: string; refName: string }): Promise<string | null> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_ref_previous_response_id_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName
  });
  if (error) {
    throw new Error(error.message);
  }
  if (data == null) return null;
  return String(data);
}

export async function rtSetRefPreviousResponseIdV1(input: {
  projectId: string;
  refName: string;
  previousResponseId: string | null;
}): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_set_ref_previous_response_id_v1', {
    p_project_id: input.projectId,
    p_ref_name: input.refName,
    p_previous_response_id: input.previousResponseId ?? null
  });
  if (error) {
    throw new Error(error.message);
  }
}
