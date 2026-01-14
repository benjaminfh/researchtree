// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export interface RefLeaseSummary {
  refId: string;
  userId: string;
  sessionId: string;
  expiresAt: string;
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
    userId: String(row.holder_user_id),
    sessionId: String(row.holder_session_id),
    expiresAt: new Date(row.expires_at).toISOString()
  }));
}

export async function rtAcquireRefLeaseShadowV1(input: {
  projectId: string;
  refId: string;
  sessionId: string;
  ttlSeconds: number;
}): Promise<RefLeaseSummary & { acquired: boolean }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_acquire_ref_lease_v1', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_session_id: input.sessionId,
    p_ttl_seconds: input.ttlSeconds
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('No data returned from rt_acquire_ref_lease_v1');
  }
  return {
    refId: String(row.ref_id),
    userId: String(row.holder_user_id),
    sessionId: String(row.holder_session_id),
    expiresAt: new Date(row.expires_at).toISOString(),
    acquired: Boolean(row.acquired)
  };
}

export async function rtReleaseRefLeaseShadowV1(input: {
  projectId: string;
  refId: string;
  sessionId: string;
}): Promise<boolean> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_release_ref_lease_v1', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_session_id: input.sessionId
  });
  if (error) {
    throw new Error(error.message);
  }
  return Boolean((data as any)?.result ?? data);
}
