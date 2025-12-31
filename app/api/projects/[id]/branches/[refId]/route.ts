// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, badRequest, notFound } from '@/src/server/http';
import { renameBranchSchema } from '@/src/server/schemas';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { requireProjectAccess } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';

interface RouteContext {
  params: { id: string; refId: string };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });
    const body = await request.json().catch(() => null);
    const parsed = renameBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    if (store.mode === 'pg') {
      return await withProjectLock(params.id, async () => {
        const { rtRenameRefShadowV2 } = await import('@/src/store/pg/branches');
        const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');

        if (!params.refId?.trim()) {
          throw badRequest('Branch id is required');
        }

        await rtRenameRefShadowV2({
          projectId: params.id,
          refId: params.refId,
          newName: parsed.data.name
        });

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
    const { renameBranch, listBranches } = await import('@git/branches');
    const { getCurrentBranchName } = await import('@git/utils');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    return await withProjectLock(project.id, async () => {
      await renameBranch(project.id, params.refId, parsed.data.name);
      const branches = await listBranches(project.id);
      const currentBranch = await getCurrentBranchName(project.id);
      return Response.json({ branchName: currentBranch, branches });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
