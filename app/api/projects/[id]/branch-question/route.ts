// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { branchQuestionSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { resolveBranchConfig } from '@/src/server/branchConfig';
import { resolveOpenAIProviderSelection } from '@/src/server/llm';
import type { LLMProvider } from '@/src/server/llm';
import { POST as chatPost } from '@/app/api/projects/[id]/chat/route';
import { consumeNdjsonStream } from '@/src/utils/ndjsonStream';

interface RouteContext {
  params: { id: string };
}

type BranchCreateResult = {
  branchName: string;
  branchId?: string | null;
  branches: unknown;
  provider: LLMProvider;
  model: string | null;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = branchQuestionSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const {
      name,
      fromRef,
      fromNodeId,
      provider,
      model,
      question,
      highlight,
      thinking,
      switch: shouldSwitch
    } = parsed.data;
    const fromNode = fromNodeId.trim();
    const highlightText = highlight.trim();
    if (!fromNode || !highlightText) {
      throw badRequest('Question branches require an assistant highlight and fromNodeId.');
    }

    const createResult: BranchCreateResult = await (async () => {
      if (store.mode === 'pg') {
        return await withProjectLock(params.id, async () => {
          const { rtGetCurrentRefShadowV2, rtSetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
          const { rtCreateRefFromNodeShadowV2 } = await import('@/src/store/pg/branches');
          const { rtGetNodeContentShadowV1 } = await import('@/src/store/pg/nodes');
          const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');

          const existingBranches = await rtListRefsShadowV2({ projectId: params.id });
          const currentRef = fromRef
            ? null
            : await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: 'main' });
          const baseRefName = fromRef ?? currentRef?.refName ?? 'main';
          const baseBranch =
            fromRef
              ? existingBranches.find((b) => b.name === baseRefName)
              : currentRef?.refId
                ? existingBranches.find((b) => b.id === currentRef.refId) ??
                  (currentRef.refName ? existingBranches.find((b) => b.name === currentRef.refName) : undefined)
                : existingBranches.find((b) => b.name === baseRefName);
          if (!baseBranch?.id) {
            throw badRequest(`Branch ${baseRefName} does not exist`);
          }

          const baseConfig = resolveBranchConfig({
            provider: baseBranch?.provider ?? null,
            model: baseBranch?.model ?? null
          });
          const requestedProvider = provider ? resolveOpenAIProviderSelection(provider) : baseConfig.provider;
          const resolvedConfig = resolveBranchConfig({
            provider: requestedProvider,
            model: model ?? (provider ? null : baseConfig.model),
            fallback: baseConfig
          });
          const shouldCopyPreviousResponseId =
            baseConfig.provider === 'openai_responses' && resolvedConfig.provider === 'openai_responses';

          const node = (await rtGetNodeContentShadowV1({ projectId: params.id, nodeId: fromNode })) as any | null;
          if (!node) {
            throw badRequest(`Node ${fromNode} not found`);
          }
          if (node.type !== 'message' || node.role !== 'assistant') {
            throw badRequest('Only assistant message nodes can be used to create a branch split');
          }
          const nodeResponseId =
            shouldCopyPreviousResponseId && typeof node.responseId === 'string' && node.responseId.trim().length > 0
              ? node.responseId
              : null;
          await rtCreateRefFromNodeShadowV2({
            projectId: params.id,
            newRefName: name,
            sourceRefId: baseBranch.id,
            nodeId: fromNode,
            provider: resolvedConfig.provider,
            model: resolvedConfig.model,
            previousResponseId: shouldCopyPreviousResponseId ? nodeResponseId : null
          });

          const branches = await rtListRefsShadowV2({ projectId: params.id });
          const newBranch = branches.find((branch) => branch.name === name);
          if (shouldSwitch && newBranch?.id) {
            await rtSetCurrentRefShadowV2({ projectId: params.id, refId: newBranch.id });
          }
          return {
            branchName: name,
            branchId: newBranch?.id ?? null,
            branches,
            provider: resolvedConfig.provider,
            model: resolvedConfig.model
          };
        });
      }

      const { getProject } = await import('@git/projects');
      const { createBranch, listBranches, switchBranch } = await import('@git/branches');
      const project = await getProject(params.id);
      if (!project) {
        throw notFound('Project not found');
      }

      return await withProjectLock(project.id, async () => {
        const existingBranches = await listBranches(project.id);
        const baseRef = fromRef ?? (existingBranches.find((b) => b.isTrunk)?.name ?? 'main');
        const baseBranch = existingBranches.find((b) => b.name === baseRef);
        const baseConfig = resolveBranchConfig({
          provider: baseBranch?.provider ?? null,
          model: baseBranch?.model ?? null
        });
        const requestedProvider = provider ? resolveOpenAIProviderSelection(provider) : baseConfig.provider;
        const resolvedConfig = resolveBranchConfig({
          provider: requestedProvider,
          model: model ?? (provider ? null : baseConfig.model),
          fallback: baseConfig
        });
        const shouldCopyPreviousResponseId =
          baseConfig.provider === 'openai_responses' && resolvedConfig.provider === 'openai_responses';

        const { getCommitHashForNode, readNodesFromRef } = await import('@git/utils');
        const sourceNodes = await readNodesFromRef(project.id, baseRef);
        const node = sourceNodes.find((entry) => entry.id === fromNode);
        if (!node) {
          throw badRequest(`Node ${fromNode} not found on ref ${baseRef}`);
        }
        if (node.type !== 'message' || node.role !== 'assistant') {
          throw badRequest('Only assistant message nodes can be used to create a branch split');
        }
        const commitHash = await getCommitHashForNode(project.id, baseRef, fromNode);
        const nodeResponseId =
          shouldCopyPreviousResponseId &&
          typeof (node as any)?.responseId === 'string' &&
          (node as any).responseId.trim().length > 0
            ? (node as any).responseId
            : null;
        await createBranch(project.id, name, commitHash, {
          provider: resolvedConfig.provider,
          model: resolvedConfig.model,
          previousResponseId: shouldCopyPreviousResponseId ? nodeResponseId : null
        });

        const branches = await listBranches(project.id);
        if (shouldSwitch) {
          await switchBranch(project.id, name);
        }
        return { branchName: name, branches, provider: resolvedConfig.provider, model: resolvedConfig.model };
      });
    })();

    const chatHeaders = new Headers(request.headers);
    chatHeaders.set('content-type', 'application/json');
    const chatBody = JSON.stringify({
      question,
      highlight: highlightText,
      llmProvider: createResult.provider,
      ref: createResult.branchName,
      thinking
    });
    const chatRequest = new Request(request.url, {
      method: 'POST',
      headers: chatHeaders,
      body: chatBody
    });
    if (shouldSwitch) {
      return await chatPost(chatRequest, { params });
    }

    const chatResponse = await chatPost(chatRequest, { params });
    if (!chatResponse.ok) {
      return chatResponse;
    }
    if (!chatResponse.body) {
      throw new Error('Chat response missing body for question branch');
    }

    const reader = chatResponse.body.getReader();
    const { errorMessage } = await consumeNdjsonStream(reader, {
      defaultErrorMessage: 'Question branch failed'
    });
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        branchName: createResult.branchName,
        branchId: createResult.branchId ?? null,
        branches: createResult.branches,
        provider: createResult.provider,
        model: createResult.model
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
