// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError } from '@/src/server/http';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { requireProjectAccess } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';

interface RouteContext {
  params: { id: string; refId: string };
}

async function toggleHidden({ params, isHidden }: { params: { id: string; refId: string }; isHidden: boolean }) {
  await requireUser();
  const store = getStoreConfig();
  await requireProjectAccess({ id: params.id });

  if (store.mode === 'pg') {
    return await withProjectLock(params.id, async () => {
      const { rtSetRefHiddenShadowV1 } = await import('@/src/store/pg/branches');
      const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
      const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');

      const branches = await rtListRefsShadowV2({ projectId: params.id });
      const target = branches.find((branch) => branch.id === params.refId || branch.name === params.refId);
      if (!target?.id) {
        throw badRequest('Branch not found');
      }

      await rtSetRefHiddenShadowV1({ projectId: params.id, refId: target.id, isHidden });

      const current = await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: 'main' });
      const updatedBranches = await rtListRefsShadowV2({ projectId: params.id });

      return Response.json({
        branchName: current.refName,
        branchId: current.refId,
        branches: updatedBranches
      });
    });
  }

  const { setBranchHiddenFlag, listBranches } = await import('@git/branches');
  const { getProject } = await import('@git/projects');
  const { getCurrentBranchName } = await import('@git/utils');

  const project = await getProject(params.id);
  if (!project) {
    throw badRequest('Project not found');
  }

  return await withProjectLock(project.id, async () => {
    await setBranchHiddenFlag(project.id, params.refId, isHidden);
    const branches = await listBranches(project.id);
    const currentBranch = await getCurrentBranchName(project.id);

    return Response.json({
      branchName: currentBranch,
      branches
    });
  });
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    return await toggleHidden({ params, isHidden: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    return await toggleHidden({ params, isHidden: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
