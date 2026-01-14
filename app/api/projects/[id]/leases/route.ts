// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { requireProjectAccess } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';
import { getLeaseTtlSeconds } from '@/src/server/leases';
import { z } from 'zod';

interface RouteContext {
  params: { id: string };
}

const leaseSchema = z.object({
  refId: z.string().uuid(),
  sessionId: z.string().min(1)
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only available in Postgres mode.');
    }

    const { rtListRefLeasesShadowV1 } = await import('@/src/store/pg/leases');
    const leases = await rtListRefLeasesShadowV1({ projectId: params.id });
    return Response.json({ leases });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only available in Postgres mode.');
    }

    const body = await request.json().catch(() => null);
    const parsed = leaseSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { rtAcquireRefLeaseShadowV1 } = await import('@/src/store/pg/leases');
    const lease = await rtAcquireRefLeaseShadowV1({
      projectId: params.id,
      refId: parsed.data.refId,
      sessionId: parsed.data.sessionId,
      ttlSeconds: getLeaseTtlSeconds()
    });

    return Response.json({ lease });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only available in Postgres mode.');
    }

    const body = await request.json().catch(() => null);
    const parsed = leaseSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { rtReleaseRefLeaseShadowV1 } = await import('@/src/store/pg/leases');
    const released = await rtReleaseRefLeaseShadowV1({
      projectId: params.id,
      refId: parsed.data.refId,
      sessionId: parsed.data.sessionId
    });

    return Response.json({ released });
  } catch (error) {
    return handleRouteError(error);
  }
}
