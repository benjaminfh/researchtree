// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { buildChatContext } from '@/src/server/context';
import { editMessageSchema } from '@/src/server/schemas';
import { acquireProjectRefLock, withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';
import { resolveOpenAIProviderSelection, streamAssistantCompletion } from '@/src/server/llm';
import { type ThinkingSetting } from '@/src/shared/thinking';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectEditor } from '@/src/server/authz';
import { v4 as uuidv4 } from 'uuid';
import { requireUserApiKeyForProvider } from '@/src/server/llmUserKeys';
import { getDefaultThinkingSetting, validateThinkingSetting } from '@/src/shared/llmCapabilities';
import { deriveTextFromBlocks } from '@/src/shared/thinkingTraces';
import type { ThinkingContentBlock } from '@/src/shared/thinkingTraces';
import { buildContentBlocksForProvider, buildTextBlock } from '@/src/server/llmContentBlocks';
import { getBranchConfigMap, resolveBranchConfig } from '@/src/server/branchConfig';
import { getPreviousResponseId, setPreviousResponseId } from '@/src/server/llmState';
import { toJsonValue } from '@/src/server/json';
import { acquireBranchLease } from '@/src/server/leases';

interface RouteContext {
  params: { id: string };
}

const debugResponses = process.env.RT_DEBUG_RESPONSES === 'true';
const logResponses = (label: string, payload: Record<string, unknown>) => {
  if (!debugResponses) return;
  console.info('[responses-debug]', label, payload);
};

async function getPreferredBranch(projectId: string): Promise<{ id: string | null; name: string }> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { resolveCurrentRef } = await import('@/src/server/pgRefs');
    const current = await resolveCurrentRef(projectId, 'main');
    return { id: current.id, name: current.name };
  }
  const { getCurrentBranchName } = await import('@git/utils');
  const name = await getCurrentBranchName(projectId).catch(() => 'main');
  return { id: null, name };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectEditor({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = editMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const {
      content,
      branchName,
      fromRef,
      nodeId,
      llmProvider,
      llmModel,
      thinking,
      leaseSessionId
    } = parsed.data as typeof parsed.data & {
      thinking?: ThinkingSetting;
    };
    const currentBranch = await getPreferredBranch(params.id);
    const targetBranch = branchName?.trim() || `edit-${Date.now()}`;
    const explicitFromRef = fromRef?.trim() || null;
    const sourceRef = explicitFromRef ?? currentBranch.name;
    const branchConfigMap = await getBranchConfigMap(params.id);
    const baseConfig = branchConfigMap[sourceRef] ?? resolveBranchConfig();
    const requestedProvider = llmProvider ? resolveOpenAIProviderSelection(llmProvider) : baseConfig.provider;
    const requestedConfig = resolveBranchConfig({
      provider: requestedProvider,
      model: llmModel ?? (llmProvider ? null : baseConfig.model),
      fallback: baseConfig
    });
    const provider = requestedConfig.provider;
    const modelName = requestedConfig.model;
    const shouldCopyPreviousResponseId =
      baseConfig.provider === 'openai_responses' && provider === 'openai_responses';
    logResponses('edit.branch.base', {
      sourceRef,
      provider,
      model: modelName,
      shouldCopyPreviousResponseId
    });
    const effectiveThinking = thinking ?? getDefaultThinkingSetting(provider, modelName);
    const thinkingValidation = validateThinkingSetting(provider, modelName, effectiveThinking);
    if (!thinkingValidation.ok) {
      throw badRequest(thinkingValidation.message ?? 'Invalid thinking setting', {
        provider,
        modelName,
        thinking: effectiveThinking,
        allowed: thinkingValidation.allowed
      });
    }

    if (store.mode === 'pg') {
      const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
      const branches = await rtListRefsShadowV2({ projectId: params.id });
      const existingTarget = branches.find((branch) => branch.name === targetBranch);
      if (existingTarget?.id) {
        await acquireBranchLease({ projectId: params.id, refId: existingTarget.id, leaseSessionId });
      }
    }

    return await withProjectLock(params.id, async () => {
      const releaseRefLock = await acquireProjectRefLock(params.id, sourceRef);
      try {
        if (store.mode === 'pg') {
          const { rtCreateRefFromNodeParentShadowV2 } = await import('@/src/store/pg/branches');
          const { rtSetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
          const { rtAppendNodeToRefShadowV2, rtGetNodeContentShadowV1 } = await import('@/src/store/pg/nodes');
          const { rtGetHistoryShadowV2, rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
          const { resolveRefByName } = await import('@/src/server/pgRefs');

          const targetNode = (await rtGetNodeContentShadowV1({ projectId: params.id, nodeId })) as any | null;
          if (!targetNode) {
            throw badRequest(`Node ${nodeId} not found`);
          }
          if (targetNode.type !== 'message') {
            throw badRequest('Only message nodes can be edited');
          }
          let previousResponseId: string | null = null;
          if (shouldCopyPreviousResponseId && targetNode.role === 'user') {
            const parentId = typeof targetNode.parent === 'string' ? targetNode.parent : null;
            if (parentId) {
              const parentNode = (await rtGetNodeContentShadowV1({ projectId: params.id, nodeId: parentId })) as any | null;
              const candidate = parentNode?.role === 'assistant' ? parentNode?.responseId : null;
              if (typeof candidate === 'string' && candidate.trim().length > 0) {
                previousResponseId = candidate.trim();
              }
            }
          }
          logResponses('edit.branch.pg', {
            nodeId,
            previousResponseId
          });

          const apiKey = targetNode.role === 'user' ? await requireUserApiKeyForProvider(provider) : null;
          const sourceRefInfo = explicitFromRef
            ? await resolveRefByName(params.id, sourceRef)
            : { id: currentBranch.id, name: sourceRef };
          if (!sourceRefInfo.id) {
            throw badRequest(`Branch ${sourceRef} is missing ref id`);
          }

          await rtCreateRefFromNodeParentShadowV2({
            projectId: params.id,
            sourceRefId: sourceRefInfo.id,
            newRefName: targetBranch,
            nodeId,
            provider,
            model: modelName,
            previousResponseId
          });

          const branches = await rtListRefsShadowV2({ projectId: params.id });
          const targetRef = branches.find((branch) => branch.name === targetBranch);
          if (!targetRef?.id) {
            throw badRequest(`Branch ${targetBranch} is missing ref id`);
          }

          await acquireBranchLease({ projectId: params.id, refId: targetRef.id, leaseSessionId });
          await rtSetCurrentRefShadowV2({ projectId: params.id, refId: targetRef.id });

          const lastTargetRows = await rtGetHistoryShadowV2({
            projectId: params.id,
            refId: targetRef.id,
            limit: 1
          }).catch(() => []);
          const lastTargetNode = (lastTargetRows[0]?.nodeJson as any) ?? null;
          const parentId = lastTargetNode?.id ? String(lastTargetNode.id) : null;

          const editedNode = {
            id: uuidv4(),
            type: 'message',
            role: targetNode.role,
            content,
            contentBlocks: buildTextBlock(content),
            timestamp: Date.now(),
            parent: parentId,
            createdOnBranch: targetBranch
          };

          await rtAppendNodeToRefShadowV2({
            projectId: params.id,
            refId: targetRef.id,
            kind: editedNode.type,
            role: editedNode.role,
            contentJson: editedNode,
            nodeId: editedNode.id,
            commitMessage: 'edit_message',
            attachDraft: true
          });

          let assistantNode: any = null;
          if (editedNode.role === 'user') {
            try {
              const tokenLimit = await getProviderTokenLimit(provider, modelName);
              const context = await buildChatContext(params.id, { tokenLimit, ref: targetBranch });
              const messagesForCompletion = context.messages;

              let buffered = '';
              const streamBlocks: ThinkingContentBlock[] = [];
              let rawResponse: unknown = null;
              let responseId: string | null = null;
            const previousResponseId =
              provider === 'openai_responses'
                ? await getPreviousResponseId(params.id, { id: targetRef.id, name: targetBranch }).catch(() => null)
                : null;
            for await (const chunk of streamAssistantCompletion({
              messages: messagesForCompletion,
              provider,
              model: modelName,
                thinking: effectiveThinking,
                apiKey,
                previousResponseId
              })) {
                if (chunk.type === 'thinking') {
                  const last = streamBlocks[streamBlocks.length - 1];
                  if (chunk.append && last?.type === 'thinking') {
                    last.thinking += chunk.content;
                  } else {
                    streamBlocks.push({
                      type: 'thinking',
                      thinking: chunk.content
                    });
                  }
                  continue;
                }
                if (chunk.type === 'thinking_signature') {
                  streamBlocks.push({
                    type: 'thinking_signature',
                    signature: chunk.content
                  });
                  continue;
                }
                if (chunk.type === 'raw_response') {
                  rawResponse = chunk.payload ?? null;
                  if (rawResponse && typeof rawResponse === 'object' && (rawResponse as any).responseId) {
                    responseId = String((rawResponse as any).responseId);
                  }
                  continue;
                }
                const lastText = streamBlocks[streamBlocks.length - 1];
                if (lastText?.type === 'text') {
                  lastText.text += chunk.content;
                } else {
                  streamBlocks.push({ type: 'text', text: chunk.content });
                }
                buffered += chunk.content;
              }

              if (buffered.trim()) {
                const contentBlocks = buildContentBlocksForProvider({
                  provider,
                  rawResponse,
                  fallbackText: buffered,
                  fallbackBlocks: streamBlocks
                });
                const contentText = deriveTextFromBlocks(contentBlocks) || buffered;
                const rawResponseForStorage = toJsonValue(rawResponse);
                assistantNode = {
                  id: uuidv4(),
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  timestamp: Date.now(),
                  parent: editedNode.id,
                  createdOnBranch: targetBranch,
                  modelUsed: modelName,
                  responseId: responseId ?? undefined,
                  interrupted: false,
                  rawResponse: rawResponseForStorage
                };

                await rtAppendNodeToRefShadowV2({
                  projectId: params.id,
                  refId: targetRef.id,
                  kind: assistantNode.type,
                  role: assistantNode.role,
                  contentJson: assistantNode,
                  nodeId: assistantNode.id,
                  commitMessage: 'assistant_message',
                  attachDraft: false,
                  rawResponse: rawResponseForStorage
                });
                if (provider === 'openai_responses' && responseId) {
                  await setPreviousResponseId(params.id, { id: targetRef.id, name: targetBranch }, responseId);
                }
              } else {
                console.warn('[edit] Skipping empty assistant response');
              }
            } catch (error) {
              console.error('[edit] Failed to run LLM completion after edit', error);
            }
          }

          return Response.json({ branchName: targetBranch, node: editedNode, assistantNode }, { status: 201 });
        }

        const { appendNode } = await import('@git/nodes');
        const { createBranch } = await import('@git/branches');
        const { getProject } = await import('@git/projects');
        const { getCommitHashForNode, readNodesFromRef } = await import('@git/utils');

        const project = await getProject(params.id);
        if (!project) {
          throw notFound('Project not found');
        }

        const sourceNodes = await readNodesFromRef(project.id, sourceRef);
        const targetNode = sourceNodes.find((node) => node.id === nodeId);
        if (!targetNode) {
          throw badRequest(`Node ${nodeId} not found on ref ${sourceRef}`);
        }
        if (targetNode.type !== 'message') {
          throw badRequest('Only message nodes can be edited');
        }
        let previousResponseId: string | null = null;
        if (shouldCopyPreviousResponseId && targetNode.role === 'user') {
          const parentId = typeof (targetNode as any).parent === 'string' ? String((targetNode as any).parent) : null;
          if (parentId) {
            const parentNode = sourceNodes.find((node) => node.id === parentId);
            const parentIsAssistant =
              parentNode?.type === 'message' && (parentNode as { role?: string })?.role === 'assistant';
            const candidate = parentIsAssistant ? (parentNode as any)?.responseId : null;
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
              previousResponseId = candidate.trim();
            }
          }
        }
        logResponses('edit.branch.git', {
          nodeId,
          previousResponseId
        });

        const apiKey = targetNode.role === 'user' ? await requireUserApiKeyForProvider(provider) : null;

        try {
          const commitHash = await getCommitHashForNode(project.id, sourceRef, nodeId, { parent: true });
          await createBranch(project.id, targetBranch, commitHash, {
            provider,
            model: modelName,
            previousResponseId
          });
        } catch (err) {
          const message = (err as Error)?.message ?? 'Failed to create edit branch';
          throw badRequest(message);
        }

        const node = await appendNode(
          project.id,
          {
            type: 'message',
            role: targetNode.role,
            content,
            contentBlocks: buildTextBlock(content)
          },
          { ref: targetBranch }
        );

        let assistantNode: any = null;
        if (node.type === 'message' && node.role === 'user') {
          try {
            const tokenLimit = await getProviderTokenLimit(provider, modelName);
            const context = await buildChatContext(project.id, { tokenLimit, ref: targetBranch });
            const messagesForCompletion = context.messages;

            let buffered = '';
            const streamBlocks: ThinkingContentBlock[] = [];
            let rawResponse: unknown = null;
            let responseId: string | null = null;
            const previousResponseId =
              provider === 'openai_responses'
                ? await getPreviousResponseId(params.id, { id: null, name: targetBranch }).catch(() => null)
                : null;
            for await (const chunk of streamAssistantCompletion({
              messages: messagesForCompletion,
              provider,
              model: modelName,
              thinking: effectiveThinking,
              apiKey,
              previousResponseId
            })) {
              if (chunk.type === 'thinking') {
                const last = streamBlocks[streamBlocks.length - 1];
                if (chunk.append && last?.type === 'thinking') {
                  last.thinking += chunk.content;
                } else {
                  streamBlocks.push({
                    type: 'thinking',
                    thinking: chunk.content
                  });
                }
                continue;
              }
              if (chunk.type === 'thinking_signature') {
                streamBlocks.push({
                  type: 'thinking_signature',
                  signature: chunk.content
                });
                continue;
              }
              if (chunk.type === 'raw_response') {
                rawResponse = chunk.payload ?? null;
                if (rawResponse && typeof rawResponse === 'object' && (rawResponse as any).responseId) {
                  responseId = String((rawResponse as any).responseId);
                }
                continue;
              }
              const lastText = streamBlocks[streamBlocks.length - 1];
              if (lastText?.type === 'text') {
                lastText.text += chunk.content;
              } else {
                streamBlocks.push({ type: 'text', text: chunk.content });
              }
              buffered += chunk.content;
            }

            if (buffered.trim()) {
              const contentBlocks = buildContentBlocksForProvider({
                provider,
                rawResponse,
                fallbackText: buffered,
                fallbackBlocks: streamBlocks
              });
              const contentText = deriveTextFromBlocks(contentBlocks) || buffered;
              const rawResponseForStorage = toJsonValue(rawResponse);
              assistantNode = await appendNode(
                project.id,
                {
                  type: 'message',
                  role: 'assistant',
                  content: contentText,
                  contentBlocks,
                  modelUsed: modelName,
                  responseId: responseId ?? undefined,
                  interrupted: false,
                  rawResponse: rawResponseForStorage
                },
                { ref: targetBranch }
              );
              if (provider === 'openai_responses' && responseId) {
                await setPreviousResponseId(params.id, { id: null, name: targetBranch }, responseId);
              }
            } else {
              console.warn('[edit] Skipping empty assistant response');
            }
          } catch (error) {
            console.error('[edit] Failed to run LLM completion after edit', error);
          }
        }

        return Response.json({ branchName: targetBranch, node, assistantNode }, { status: 201 });
      } finally {
        releaseRefLock();
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
