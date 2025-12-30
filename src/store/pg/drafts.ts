// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtSaveArtefactDraftV2(input: {
  projectId: string;
  refId: string;
  content: string;
}): Promise<{ contentHash: string; updatedAt: string }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_save_artefact_draft_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_content: input.content ?? ''
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_save_artefact_draft_v2');
  }

  return {
    contentHash: String(row.content_hash),
    updatedAt: String(row.updated_at)
  };
}
