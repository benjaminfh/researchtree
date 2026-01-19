// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { abortStream } from '@/src/server/stream-registry';
import { requireUser } from '@/src/server/auth';
import { handleRouteError, notFound } from '@/src/server/http';
import { requireProjectAccess } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode === 'git') {
      const { getProject } = await import('@git/projects');
      const project = await getProject(params.id);
      if (!project) {
        throw notFound('Project not found');
      }
    }
    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref') ?? undefined;
    const refId = searchParams.get('refId')?.trim();
    let resolvedRef = ref ?? undefined;
    if (refId) {
      if (store.mode === 'git') {
        const { getBranchNameByIdMap } = await import('@/src/git/branchIds');
        const nameById = await getBranchNameByIdMap(params.id);
        resolvedRef = nameById[refId] ?? resolvedRef;
      } else {
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
        const branches = await rtListRefsShadowV2({ projectId: params.id });
        const match = branches.find((branch) => branch.id === refId);
        resolvedRef = match?.name ?? resolvedRef;
      }
    }
    const aborted = abortStream(params.id, resolvedRef);
    return Response.json({ aborted });
  } catch (error) {
    return handleRouteError(error);
  }
}
