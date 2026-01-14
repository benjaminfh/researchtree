// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, forbidden } from '@/src/server/http';
import { rtAcquireRefLeaseShadowV1 } from '@/src/store/pg/leases';

const DEFAULT_LEASE_TTL_SECONDS = 300;

export function getLeaseTtlSeconds(): number {
  const raw = process.env.RT_REF_LEASE_TTL_SECONDS ?? process.env.RT_REF_LEASE_TTL;
  if (!raw) return DEFAULT_LEASE_TTL_SECONDS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_LEASE_TTL_SECONDS;
}

export async function ensureBranchLease(input: {
  projectId: string;
  refId: string;
  sessionId: string | null | undefined;
}): Promise<{ holderUserId: string; expiresAt: string }> {
  const sessionId = input.sessionId?.trim() ?? '';
  if (!sessionId) {
    throw badRequest('Lease session required');
  }
  try {
    const lease = await rtAcquireRefLeaseShadowV1({
      projectId: input.projectId,
      refId: input.refId,
      sessionId,
      ttlSeconds: getLeaseTtlSeconds()
    });
    if (!lease.acquired) {
      throw forbidden('Branch is locked by another editor.');
    }
    return { holderUserId: lease.userId, expiresAt: lease.expiresAt };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Not authorized')) {
      throw forbidden('Not authorized to edit this project.');
    }
    throw error;
  }
}
