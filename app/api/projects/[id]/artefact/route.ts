// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { updateArtefactSchema } from '@/src/server/schemas';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { INITIAL_BRANCH } from '@git/constants';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess, requireProjectEditor } from '@/src/server/authz';
import { acquireBranchLease } from '@/src/server/leases';

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });
    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref')?.trim() || null;
    const refId = searchParams.get('refId')?.trim() || null;
    const effectiveRef = ref ?? INITIAL_BRANCH;

    if (store.mode === 'pg') {
      const { rtGetCanvasShadowV2, rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
      const { resolveCurrentRef, resolveRefByName } = await import('@/src/server/pgRefs');
      let resolved = ref?.trim()
        ? await resolveRefByName(params.id, ref)
        : await resolveCurrentRef(params.id, INITIAL_BRANCH);
      if (refId) {
        const branches = await rtListRefsShadowV2({ projectId: params.id });
        const match = branches.find((branch) => branch.id === refId);
        if (!match) {
          throw badRequest(`Branch ${refId} not found`);
        }
        resolved = { id: match.id, name: match.name };
      }
      const canvas = await rtGetCanvasShadowV2({ projectId: params.id, refId: resolved.id });
      const updatedAtMs = canvas.updatedAt ? Date.parse(canvas.updatedAt) : null;
      return Response.json({
        artefact: canvas.content,
        lastStateNodeId: null,
        lastUpdatedAt: Number.isFinite(updatedAtMs as number) ? updatedAtMs : null
      });
    }

    const { getProject } = await import('@git/projects');
    const { getArtefactFromRef } = await import('@git/artefact');
    const { readNodesFromRef } = await import('@git/utils');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    let resolvedRefName = effectiveRef;
    if (refId) {
      const { getBranchNameByIdMap } = await import('@/src/git/branchIds');
      const nameById = await getBranchNameByIdMap(params.id);
      resolvedRefName = nameById[refId] ?? resolvedRefName;
    }
    const [artefact, nodes] = await Promise.all([
      getArtefactFromRef(project.id, resolvedRefName),
      readNodesFromRef(project.id, resolvedRefName)
    ]);
    const lastState = [...nodes].reverse().find((node) => node.type === 'state');

    return Response.json({
      artefact,
      lastStateNodeId: lastState?.id ?? null,
      lastUpdatedAt: lastState?.timestamp ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectEditor({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = updateArtefactSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref')?.trim() || INITIAL_BRANCH;
    const refId = searchParams.get('refId')?.trim() || null;

    let lockRef = ref;
    if (refId) {
      const storeConfig = getStoreConfig();
      if (storeConfig.mode === 'pg') {
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
        const branches = await rtListRefsShadowV2({ projectId: params.id });
        const match = branches.find((branch) => branch.id === refId);
        if (!match) {
          throw badRequest(`Branch ${refId} not found`);
        }
        lockRef = match.name;
      } else {
        const { getBranchNameByIdMap } = await import('@/src/git/branchIds');
        const nameById = await getBranchNameByIdMap(params.id);
        lockRef = nameById[refId] ?? lockRef;
      }
    }

    return await withProjectLockAndRefLock(params.id, lockRef, async () => {
      if (store.mode === 'pg') {
        const { rtSaveArtefactDraftV2 } = await import('@/src/store/pg/drafts');
        const { rtGetCanvasShadowV2, rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
        const { resolveCurrentRef, resolveRefByName } = await import('@/src/server/pgRefs');
        let resolved = ref?.trim()
          ? await resolveRefByName(params.id, ref)
          : await resolveCurrentRef(params.id, INITIAL_BRANCH);
        if (refId) {
          const branches = await rtListRefsShadowV2({ projectId: params.id });
          const match = branches.find((branch) => branch.id === refId);
          if (!match) {
            throw badRequest(`Branch ${refId} not found`);
          }
          resolved = { id: match.id, name: match.name };
        }
        await acquireBranchLease({ projectId: params.id, refId: resolved.id, leaseSessionId: parsed.data.leaseSessionId });
        await rtSaveArtefactDraftV2({ projectId: params.id, refId: resolved.id, content: parsed.data.content ?? '' });
        const canvas = await rtGetCanvasShadowV2({ projectId: params.id, refId: resolved.id });
        const updatedAtMs = canvas.updatedAt ? Date.parse(canvas.updatedAt) : null;
        return Response.json(
          {
            artefact: canvas.content,
            lastStateNodeId: null,
            lastUpdatedAt: Number.isFinite(updatedAtMs as number) ? updatedAtMs : null
          },
          { status: 200 }
        );
      }

      const { getProject } = await import('@git/projects');
      const { getArtefactFromRef, updateArtefact } = await import('@git/artefact');
      const { readNodesFromRef } = await import('@git/utils');

      const project = await getProject(params.id);
      if (!project) {
        throw notFound('Project not found');
      }

      let resolvedRefName = ref;
      if (refId) {
        const { getBranchNameByIdMap } = await import('@/src/git/branchIds');
        const nameById = await getBranchNameByIdMap(params.id);
        resolvedRefName = nameById[refId] ?? resolvedRefName;
      }
      try {
        await updateArtefact(project.id, parsed.data.content, resolvedRefName);
      } catch (err) {
        const message = (err as Error)?.message ?? 'Failed to update artefact';
        throw badRequest(message);
      }

      const [artefact, nodes] = await Promise.all([
        getArtefactFromRef(project.id, resolvedRefName),
        readNodesFromRef(project.id, resolvedRefName)
      ]);
      const lastState = [...nodes].reverse().find((node) => node.type === 'state');

      return Response.json(
        {
          artefact,
          lastStateNodeId: lastState?.id ?? null,
          lastUpdatedAt: lastState?.timestamp ?? null
        },
        { status: 200 }
      );
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return PUT(request, context);
}
