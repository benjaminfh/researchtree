// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { requireProjectEditor } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';

interface RouteContext {
  params: { id: string; refId: string };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectEditor({ id: params.id });

    const body = await request.json().catch(() => null);
    const isHidden = typeof body?.isHidden === 'boolean' ? body.isHidden : null;
    if (isHidden === null) {
      throw badRequest('Missing required field isHidden');
    }

    if (store.mode === 'pg') {
      return await withProjectLock(params.id, async () => {
        const { rtSetRefHiddenShadowV1 } = await import('@/src/store/pg/branches');
        const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');

        await rtSetRefHiddenShadowV1({ projectId: params.id, refId: params.refId, isHidden });
        const current = await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: 'main' });
        const branches = await rtListRefsShadowV2({ projectId: params.id });

        return Response.json({
          branchName: current.refName,
          branchId: current.refId,
          branches
        });
      });
    }

    const { getProject } = await import('@git/projects');
    const { setBranchHidden, listBranches } = await import('@git/branches');
    const { getCurrentBranchName } = await import('@git/utils');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    return await withProjectLock(project.id, async () => {
      await setBranchHidden(project.id, params.refId, isHidden);
      const branches = await listBranches(project.id);
      const branchName = await getCurrentBranchName(project.id);
      return Response.json({ branches, branchName });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
