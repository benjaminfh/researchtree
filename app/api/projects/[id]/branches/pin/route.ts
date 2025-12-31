// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, notFound } from '@/src/server/http';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { requireProjectAccess } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';

interface RouteContext {
  params: { id: string };
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode === 'pg') {
      return await withProjectLock(params.id, async () => {
        const { rtClearPinnedRefShadowV2 } = await import('@/src/store/pg/branches');
        const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');

        await rtClearPinnedRefShadowV2({ projectId: params.id });
        const current = await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: 'main' });
        const branches = await rtListRefsShadowV2({ projectId: params.id });
        return Response.json({
          branchName: current.refName,
          branchId: current.refId,
          branches
        });
      });
    }

    const { getProject, setPinnedBranchName } = await import('@git/projects');
    const { listBranches } = await import('@git/branches');
    const { getCurrentBranchName } = await import('@git/utils');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    return await withProjectLock(project.id, async () => {
      await setPinnedBranchName(project.id, null);
      const branches = await listBranches(project.id);
      const currentBranch = await getCurrentBranchName(project.id);
      return Response.json({ branches, branchName: currentBranch });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
