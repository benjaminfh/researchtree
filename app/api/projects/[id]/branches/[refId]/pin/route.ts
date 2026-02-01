// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { handleRouteError, badRequest, notFound } from '@/src/server/http';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { requireProjectEditor } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';

interface RouteContext {
  params: { id: string; refId: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectEditor({ id: params.id });

    if (store.mode === 'pg') {
      return await withProjectLock(params.id, async () => {
        const { rtSetPinnedRefShadowV2 } = await import('@/src/store/pg/branches');
        const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');

        if (!params.refId?.trim()) {
          throw badRequest('Branch id is required');
        }

        await rtSetPinnedRefShadowV2({ projectId: params.id, refId: params.refId });
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
      const branches = await listBranches(project.id);
      const exists = branches.some((branch) => branch.name === params.refId);
      if (!exists) {
        throw badRequest(`Branch ${params.refId} does not exist`);
      }
      await setPinnedBranchName(project.id, params.refId);
      const updatedBranches = await listBranches(project.id);
      const currentBranch = await getCurrentBranchName(project.id);
      return Response.json({ branches: updatedBranches, branchName: currentBranch });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
