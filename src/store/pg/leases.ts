// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getPgStoreAdapter } from '@/src/store/pg/adapter';

export interface PgRefLease {
  refId: string;
  holderUserId: string;
  holderSessionId: string;
  expiresAt: string;
}

export async function rtListRefLeasesShadowV1(input: { projectId: string }): Promise<PgRefLease[]> {
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
    holderSessionId: String(row.holder_session_id),
    expiresAt: new Date(row.expires_at).toISOString()
  }));
}

export async function rtAcquireRefLeaseShadowV1(input: {
  projectId: string;
  refId: string;
  sessionId: string;
  ttlSeconds: number;
}): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_acquire_ref_lease_v1', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_session_id: input.sessionId,
    p_ttl_seconds: input.ttlSeconds
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function rtReleaseRefLeaseShadowV1(input: {
  projectId: string;
  refId: string;
  sessionId?: string | null;
  force?: boolean;
}): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_release_ref_lease_v1', {
    p_project_id: input.projectId,
    p_ref_id: input.refId,
    p_session_id: input.sessionId ?? null,
    p_force: input.force ?? false
  });
  if (error) {
    throw new Error(error.message);
  }
}
