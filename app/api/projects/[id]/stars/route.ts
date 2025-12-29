// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { INITIAL_BRANCH } from '@git/constants';
import { z } from 'zod';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';

interface RouteContext {
  params: { id: string };
}

const toggleStarSchema = z.object({
  nodeId: z.string().min(1)
});

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode === 'pg') {
      const { rtGetStarredNodeIdsShadowV1 } = await import('@/src/store/pg/reads');
      const starredNodeIds = await rtGetStarredNodeIdsShadowV1({ projectId: params.id });
      return Response.json({ starredNodeIds });
    }

    const { getProject } = await import('@git/projects');
    const { getStarredNodeIds } = await import('@git/stars');
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const starredNodeIds = await getStarredNodeIds(project.id);
    return Response.json({ starredNodeIds });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });
    const body = await request.json().catch(() => null);
    const parsed = toggleStarSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    return await withProjectLockAndRefLock(params.id, INITIAL_BRANCH, async () => {
      if (store.mode === 'pg') {
        const { rtToggleStarV1 } = await import('@/src/store/pg/stars');
        const starredNodeIds = await rtToggleStarV1({ projectId: params.id, nodeId: parsed.data.nodeId });
        return Response.json({ starredNodeIds });
      }

      const { getProject } = await import('@git/projects');
      const { toggleStar } = await import('@git/stars');
      const project = await getProject(params.id);
      if (!project) {
        throw notFound('Project not found');
      }
      const starredNodeIds = await toggleStar(project.id, parsed.data.nodeId);
      return Response.json({ starredNodeIds });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
