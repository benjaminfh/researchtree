// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtGetRefPreviousResponseIdV2(input: { projectId: string; refId: string }): Promise<string | null> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_ref_previous_response_id_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId
  });
  if (error) {
    throw new Error(error.message);
  }
  if (data == null) return null;
  return String(data);
}

export async function rtSetRefPreviousResponseIdV2(input: {
  projectId: string;
  refId: string;
  previousResponseId: string | null;
}): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_set_ref_previous_response_id_v2', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_previous_response_id: input.previousResponseId ?? null
  });
  if (error) {
    throw new Error(error.message);
  }
}
