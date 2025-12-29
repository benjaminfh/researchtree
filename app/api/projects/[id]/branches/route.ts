// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, notFound, badRequest } from '@/src/server/http';
import { createBranchSchema, switchBranchSchema } from '@/src/server/schemas';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { resolveBranchConfig } from '@/src/server/branchConfig';
import { resolveOpenAIProviderSelection } from '@/src/server/llm';

interface RouteContext {
  params: { id: string };
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode === 'pg') {
      const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
      const { rtListRefsShadowV1 } = await import('@/src/store/pg/reads');
      const { refName } = await rtGetCurrentRefShadowV1({ projectId: params.id, defaultRefName: 'main' });
      const branches = await rtListRefsShadowV1({ projectId: params.id });
      return Response.json({ branches, currentBranch: refName });
    }

    const { getProject } = await import('@git/projects');
    const { listBranches } = await import('@git/branches');
    const { getCurrentBranchName } = await import('@git/utils');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const currentBranch = await getCurrentBranchName(project.id);
    const branches = await listBranches(project.id);
    return Response.json({ branches, currentBranch });
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
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    if (store.mode === 'pg') {
      return await withProjectLock(params.id, async () => {
        const { rtGetCurrentRefShadowV1, rtSetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
        const { rtCreateRefFromRefShadowV1 } = await import('@/src/store/pg/branches');
        const { rtListRefsShadowV1 } = await import('@/src/store/pg/reads');

        const existingBranches = await rtListRefsShadowV1({ projectId: params.id });
        const baseRef =
          parsed.data.fromRef ??
          (await rtGetCurrentRefShadowV1({ projectId: params.id, defaultRefName: 'main' })).refName ??
          'main';

        const baseBranch = existingBranches.find((b) => b.name === baseRef);
        const baseExists = Boolean(baseBranch);
        if (!baseExists) {
          throw badRequest(`Branch ${baseRef} does not exist`);
        }

        const baseConfig = resolveBranchConfig({
          provider: baseBranch?.provider ?? null,
          model: baseBranch?.model ?? null
        });
        const requestedProvider = parsed.data.provider
          ? resolveOpenAIProviderSelection(parsed.data.provider)
          : baseConfig.provider;
        const resolvedConfig = resolveBranchConfig({
          provider: requestedProvider,
          model: parsed.data.model ?? (parsed.data.provider ? null : baseConfig.model),
          fallback: baseConfig
        });

        await rtCreateRefFromRefShadowV1({
          projectId: params.id,
          newRefName: parsed.data.name,
          fromRefName: baseRef,
          provider: resolvedConfig.provider,
          model: resolvedConfig.model,
          previousResponseId: null
        });
        await rtSetCurrentRefShadowV1({ projectId: params.id, refName: parsed.data.name });
        const branches = await rtListRefsShadowV1({ projectId: params.id });
        return Response.json({ branchName: parsed.data.name, branches }, { status: 201 });
      });
    }

    const { getProject } = await import('@git/projects');
    const { createBranch, listBranches } = await import('@git/branches');
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    return await withProjectLock(project.id, async () => {
      const existingBranches = await listBranches(project.id);
      const baseRef = parsed.data.fromRef ?? (existingBranches.find((b) => b.isTrunk)?.name ?? 'main');
      const baseBranch = existingBranches.find((b) => b.name === baseRef);
      const baseConfig = resolveBranchConfig({
        provider: baseBranch?.provider ?? null,
        model: baseBranch?.model ?? null
      });
      const requestedProvider = parsed.data.provider
        ? resolveOpenAIProviderSelection(parsed.data.provider)
        : baseConfig.provider;
      const resolvedConfig = resolveBranchConfig({
        provider: requestedProvider,
        model: parsed.data.model ?? (parsed.data.provider ? null : baseConfig.model),
        fallback: baseConfig
      });
      await createBranch(project.id, parsed.data.name, parsed.data.fromRef, {
        provider: resolvedConfig.provider,
        model: resolvedConfig.model,
        previousResponseId: null
      });
      const branches = await listBranches(project.id);
      return Response.json({ branchName: parsed.data.name, branches }, { status: 201 });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });
    const body = await request.json().catch(() => null);
    const parsed = switchBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    if (store.mode === 'pg') {
      return await withProjectLock(params.id, async () => {
        const { rtSetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
        const { rtListRefsShadowV1 } = await import('@/src/store/pg/reads');
        const branches = await rtListRefsShadowV1({ projectId: params.id });
        const exists = branches.some((b) => b.name === parsed.data.name);
        if (!exists) {
          throw badRequest(`Branch ${parsed.data.name} does not exist`);
        }
        await rtSetCurrentRefShadowV1({ projectId: params.id, refName: parsed.data.name });
        const updatedBranches = await rtListRefsShadowV1({ projectId: params.id });
        return Response.json({ branchName: parsed.data.name, branches: updatedBranches });
      });
    }

    const { getProject } = await import('@git/projects');
    const { listBranches, switchBranch } = await import('@git/branches');
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    return await withProjectLock(project.id, async () => {
      const branches = await listBranches(project.id);
      const exists = branches.some((b) => b.name === parsed.data.name);
      if (!exists) {
        throw badRequest(`Branch ${parsed.data.name} does not exist`);
      }
      await switchBranch(project.id, parsed.data.name);
      const updatedBranches = await listBranches(project.id);
      return Response.json({ branchName: parsed.data.name, branches: updatedBranches });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
