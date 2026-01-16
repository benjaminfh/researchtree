// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, badRequest } from '@/src/server/http';
import { requireProjectOwner } from '@/src/server/authz';
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
    await requireProjectOwner({ id: params.id });
    const { rtListProjectMembersShadowV1, rtListProjectInvitesShadowV1 } = await import('@/src/store/pg/members');
    const [members, invites] = await Promise.all([
      rtListProjectMembersShadowV1({ projectId: params.id }),
      rtListProjectInvitesShadowV1({ projectId: params.id })
    ]);
    return Response.json({ members, invites });
  } catch (error) {
    return handleRouteError(error);
  }
}
