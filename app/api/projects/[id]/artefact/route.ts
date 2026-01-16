// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { updateArtefactSchema } from '@/src/server/schemas';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { INITIAL_BRANCH } from '@git/constants';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
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
    const effectiveRef = ref ?? INITIAL_BRANCH;

    if (store.mode === 'pg') {
      const { rtGetCanvasShadowV2 } = await import('@/src/store/pg/reads');
      const { resolveCurrentRef, resolveRefByName } = await import('@/src/server/pgRefs');
      const resolved = ref?.trim()
        ? await resolveRefByName(params.id, ref)
        : await resolveCurrentRef(params.id, INITIAL_BRANCH);
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
    const [artefact, nodes] = await Promise.all([
      getArtefactFromRef(project.id, effectiveRef),
      readNodesFromRef(project.id, effectiveRef)
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
    await requireProjectAccess({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = updateArtefactSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref')?.trim() || INITIAL_BRANCH;

    return await withProjectLockAndRefLock(params.id, ref, async () => {
      if (store.mode === 'pg') {
        const { rtSaveArtefactDraftV2 } = await import('@/src/store/pg/drafts');
        const { rtGetCanvasShadowV2 } = await import('@/src/store/pg/reads');
        const { resolveCurrentRef, resolveRefByName } = await import('@/src/server/pgRefs');
        const resolved = ref?.trim()
          ? await resolveRefByName(params.id, ref)
          : await resolveCurrentRef(params.id, INITIAL_BRANCH);
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

      try {
        await updateArtefact(project.id, parsed.data.content, ref);
      } catch (err) {
        const message = (err as Error)?.message ?? 'Failed to update artefact';
        throw badRequest(message);
      }

      const [artefact, nodes] = await Promise.all([getArtefactFromRef(project.id, ref), readNodesFromRef(project.id, ref)]);
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
