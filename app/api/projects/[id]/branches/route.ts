// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, notFound, badRequest } from '@/src/server/http';
import { createBranchSchema, switchBranchSchema } from '@/src/server/schemas';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { resolveBranchConfig } from '@/src/server/branchConfig';
import { resolveOpenAIProviderSelection } from '@/src/server/llm';
import { getPreviousResponseId } from '@/src/server/llmState';

interface RouteContext {
  params: { id: string };
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode === 'pg') {
      const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
      const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
      const { refId, refName } = await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: 'main' });
      const branches = await rtListRefsShadowV2({ projectId: params.id });
      return Response.json({ branches, currentBranch: refName, currentBranchId: refId });
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
    const fromNodeId = parsed.data.fromNodeId?.trim() || null;

    if (store.mode === 'pg') {
      return await withProjectLock(params.id, async () => {
        const { rtGetCurrentRefShadowV2, rtSetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
        const { rtCreateRefFromNodeShadowV2, rtCreateRefFromRefShadowV2 } = await import('@/src/store/pg/branches');
        const { rtGetNodeContentShadowV1 } = await import('@/src/store/pg/nodes');
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');

        const existingBranches = await rtListRefsShadowV2({ projectId: params.id });
        const currentRef = parsed.data.fromRef
          ? null
          : await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: 'main' });
        const baseRefName = parsed.data.fromRef ?? currentRef?.refName ?? 'main';
        const baseBranch =
          parsed.data.fromRef
            ? existingBranches.find((b) => b.name === baseRefName)
            : currentRef?.refId
              ? existingBranches.find((b) => b.id === currentRef.refId) ??
                (currentRef.refName ? existingBranches.find((b) => b.name === currentRef.refName) : undefined)
              : existingBranches.find((b) => b.name === baseRefName);
        const baseExists = Boolean(baseBranch);
        if (!baseExists) {
          throw badRequest(`Branch ${baseRefName} does not exist`);
        }
        if (!baseBranch?.id) {
          throw badRequest(`Branch ${baseRefName} is missing ref id`);
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
        const shouldCopyPreviousResponseId =
          baseConfig.provider === 'openai_responses' && resolvedConfig.provider === 'openai_responses';
        const basePreviousResponseId =
          shouldCopyPreviousResponseId && baseBranch.id
            ? await getPreviousResponseId(params.id, { id: baseBranch.id, name: baseRefName }).catch(() => null)
            : null;

        if (fromNodeId) {
          const node = (await rtGetNodeContentShadowV1({ projectId: params.id, nodeId: fromNodeId })) as any | null;
          if (!node) {
            throw badRequest(`Node ${fromNodeId} not found`);
          }
          if (node.type !== 'message' || node.role !== 'assistant') {
            throw badRequest('Only assistant message nodes can be used to create a branch split');
          }
          await rtCreateRefFromNodeShadowV2({
            projectId: params.id,
            newRefName: parsed.data.name,
            sourceRefId: baseBranch.id,
            nodeId: fromNodeId,
            provider: resolvedConfig.provider,
            model: resolvedConfig.model,
            previousResponseId: shouldCopyPreviousResponseId ? basePreviousResponseId : null
          });
        } else {
          await rtCreateRefFromRefShadowV2({
            projectId: params.id,
            newRefName: parsed.data.name,
            fromRefId: baseBranch.id,
            provider: resolvedConfig.provider,
            model: resolvedConfig.model,
            previousResponseId: shouldCopyPreviousResponseId ? basePreviousResponseId : null
          });
        }
        const branches = await rtListRefsShadowV2({ projectId: params.id });
        const newBranch = branches.find((branch) => branch.name === parsed.data.name);
        if (newBranch?.id) {
          await rtSetCurrentRefShadowV2({ projectId: params.id, refId: newBranch.id });
        }
        return Response.json({ branchName: parsed.data.name, branchId: newBranch?.id ?? null, branches }, { status: 201 });
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
      const shouldCopyPreviousResponseId = baseConfig.provider === 'openai_responses' && resolvedConfig.provider === 'openai_responses';
      const basePreviousResponseId =
        shouldCopyPreviousResponseId && baseBranch?.name
          ? await getPreviousResponseId(project.id, { id: null, name: baseBranch.name }).catch(() => null)
          : null;
      if (fromNodeId) {
        const { getCommitHashForNode, readNodesFromRef } = await import('@git/utils');
        const sourceNodes = await readNodesFromRef(project.id, baseRef);
        const node = sourceNodes.find((entry) => entry.id === fromNodeId);
        if (!node) {
          throw badRequest(`Node ${fromNodeId} not found on ref ${baseRef}`);
        }
        if (node.type !== 'message' || node.role !== 'assistant') {
          throw badRequest('Only assistant message nodes can be used to create a branch split');
        }
        const commitHash = await getCommitHashForNode(project.id, baseRef, fromNodeId);
        await createBranch(project.id, parsed.data.name, commitHash, {
          provider: resolvedConfig.provider,
          model: resolvedConfig.model,
          previousResponseId: shouldCopyPreviousResponseId ? basePreviousResponseId : null
        });
      } else {
        await createBranch(project.id, parsed.data.name, parsed.data.fromRef, {
          provider: resolvedConfig.provider,
          model: resolvedConfig.model,
          previousResponseId: shouldCopyPreviousResponseId ? basePreviousResponseId : null
        });
      }
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
        const { rtSetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
        const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
        const branches = await rtListRefsShadowV2({ projectId: params.id });
        const exists = branches.some((b) => b.name === parsed.data.name);
        if (!exists) {
          throw badRequest(`Branch ${parsed.data.name} does not exist`);
        }
        const selectedBranch = branches.find((b) => b.name === parsed.data.name);
        if (!selectedBranch?.id) {
          throw badRequest(`Branch ${parsed.data.name} is missing ref id`);
        }
        await rtSetCurrentRefShadowV2({ projectId: params.id, refId: selectedBranch.id });
        const updatedBranches = await rtListRefsShadowV2({ projectId: params.id });
        return Response.json({
          branchName: parsed.data.name,
          branchId: selectedBranch.id,
          branches: updatedBranches
        });
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
