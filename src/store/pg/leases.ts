// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export interface RefLeaseSummary {
  refId: string;
  holderUserId: string;
  holderSessionId: string;
  expiresAt: string;
  updatedAt: string;
}

export async function rtListRefLeasesShadowV1(input: { projectId: string }): Promise<RefLeaseSummary[]> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_list_ref_leases_v1', {
    p_project_id: input.projectId
  });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => ({
    refId: String(row.ref_id),
    holderUserId: String(row.holder_user_id),
    holderSessionId: String(row.holder_session_id ?? ''),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : new Date(0).toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date(0).toISOString()
  }));
}
