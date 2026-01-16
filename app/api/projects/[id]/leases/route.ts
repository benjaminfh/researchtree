// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { z } from 'zod';
import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess, requireProjectEditor, requireProjectOwner } from '@/src/server/authz';
import { getRefLeaseTtlSeconds } from '@/src/server/leases';

interface RouteContext {
  params: { id: string };
}

const acquireSchema = z.object({
  refId: z.string().min(1),
  leaseSessionId: z.string().min(1)
});

const releaseSchema = z.object({
  refId: z.string().min(1),
  leaseSessionId: z.string().min(1).optional().nullable(),
  force: z.boolean().optional()
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only supported in Postgres mode');
    }
    await requireUser();
    await requireProjectAccess({ id: params.id });

    const { rtListRefLeasesShadowV1 } = await import('@/src/store/pg/leases');
    const leases = await rtListRefLeasesShadowV1({ projectId: params.id });
    return Response.json({ leases });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only supported in Postgres mode');
    }
    await requireUser();
    await requireProjectEditor({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = acquireSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { rtAcquireRefLeaseShadowV1 } = await import('@/src/store/pg/leases');
    await rtAcquireRefLeaseShadowV1({
      projectId: params.id,
      refId: parsed.data.refId,
      sessionId: parsed.data.leaseSessionId,
      ttlSeconds: getRefLeaseTtlSeconds()
    });

    const { rtListRefLeasesShadowV1 } = await import('@/src/store/pg/leases');
    const leases = await rtListRefLeasesShadowV1({ projectId: params.id });
    return Response.json({ leases }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only supported in Postgres mode');
    }
    await requireUser();
    await requireProjectEditor({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    if (parsed.data.force) {
      await requireProjectOwner({ id: params.id });
    }

    const { rtReleaseRefLeaseShadowV1, rtListRefLeasesShadowV1 } = await import('@/src/store/pg/leases');
    await rtReleaseRefLeaseShadowV1({
      projectId: params.id,
      refId: parsed.data.refId,
      sessionId: parsed.data.leaseSessionId ?? null,
      force: parsed.data.force ?? false
    });

    const leases = await rtListRefLeasesShadowV1({ projectId: params.id });
    return Response.json({ leases });
  } catch (error) {
    return handleRouteError(error);
  }
}
