// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export async function rtListProjectMemberIdsShadowV1(input: { userId: string }): Promise<string[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_project_member_ids_v1', {
    p_user_id: input.userId
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => String(row.project_id));
}
