import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function rtSaveArtefactDraft(input: {
  projectId: string;
  refName: string;
  content: string;
}): Promise<{ contentHash: string; updatedAt: string }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('rt_save_artefact_draft', {
    p_project_id: input.projectId,
    p_ref_name: input.refName,
    p_content: input.content ?? ''
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_save_artefact_draft');
  }

  return {
    contentHash: String(row.content_hash),
    updatedAt: String(row.updated_at)
  };
}
