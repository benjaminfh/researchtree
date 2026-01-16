// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, badRequest } from '@/src/server/http';
import { requireProjectAccess } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Postgres store required');
    }
    await requireProjectAccess({ id: params.id });
    const { rtListRefLeasesShadowV1 } = await import('@/src/store/pg/leases');
    const leases = await rtListRefLeasesShadowV1({ projectId: params.id });
    return Response.json({ leases });
  } catch (error) {
    return handleRouteError(error);
  }
}
