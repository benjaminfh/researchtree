// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, forbidden } from '@/src/server/http';
import { getStoreConfig } from '@/src/server/storeConfig';

const DEFAULT_LEASE_TTL_SECONDS = 120;

export function getRefLeaseTtlSeconds(): number {
  const raw = process.env.RT_REF_LEASE_TTL_SECONDS;
  if (!raw) return DEFAULT_LEASE_TTL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LEASE_TTL_SECONDS;
  return Math.max(10, Math.round(parsed));
}

export function assertLeaseSession(leaseSessionId?: string | null): string {
  const session = leaseSessionId?.trim();
  if (!session) {
    throw badRequest('Lease session is required');
  }
  return session;
}

export async function acquireBranchLease(input: {
  projectId: string;
  refId: string;
  leaseSessionId?: string | null;
}): Promise<void> {
  const store = getStoreConfig();
  if (store.mode !== 'pg') return;
  if (!input.leaseSessionId?.trim()) return;
  const sessionId = assertLeaseSession(input.leaseSessionId);
  const { rtAcquireRefLeaseShadowV1 } = await import('@/src/store/pg/leases');
  try {
    await rtAcquireRefLeaseShadowV1({
      projectId: input.projectId,
      refId: input.refId,
      sessionId,
      ttlSeconds: getRefLeaseTtlSeconds()
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes('Lease held')) {
      throw forbidden('Branch is locked for editing');
    }
    throw error;
  }
}

export async function releaseBranchLease(input: {
  projectId: string;
  refId: string;
  leaseSessionId?: string | null;
  force?: boolean;
}): Promise<void> {
  const store = getStoreConfig();
  if (store.mode !== 'pg') return;
  const { rtReleaseRefLeaseShadowV1 } = await import('@/src/store/pg/leases');
  await rtReleaseRefLeaseShadowV1({
    projectId: input.projectId,
    refId: input.refId,
    sessionId: input.leaseSessionId ?? null,
    force: input.force ?? false
  });
}
