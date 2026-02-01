// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { mergeRequestSchema } from '@/src/server/schemas';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectEditor } from '@/src/server/authz';
import { buildChatContext } from '@/src/server/context';
import { getBranchConfigMap, resolveBranchConfig } from '@/src/server/branchConfig';
import { streamAssistantCompletion, type LLMProvider } from '@/src/server/llm';
import { getProviderTokenLimit } from '@/src/server/providerCapabilities';
import { requireUserApiKeyForProvider } from '@/src/server/llmUserKeys';
import { getPreviousResponseId, setPreviousResponseId } from '@/src/server/llmState';
import { buildTextBlock } from '@/src/server/llmContentBlocks';
import { toJsonValue } from '@/src/server/json';
import { getDefaultThinkingSetting, validateThinkingSetting } from '@/src/shared/llmCapabilities';
import type { NodeRecord } from '@git/types';
import { INITIAL_BRANCH } from '@git/constants';
import { v4 as uuidv4 } from 'uuid';
import { acquireBranchLease } from '@/src/server/leases';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { resolveCurrentRef } = await import('@/src/server/pgRefs');
    return (await resolveCurrentRef(projectId, INITIAL_BRANCH)).name;
  }
  const { getCurrentBranchName } = await import('@git/utils');
  return getCurrentBranchName(projectId).catch(() => INITIAL_BRANCH);
}

function buildLineDiff(base: string, incoming: string): string {
  const baseLines = base.length > 0 ? base.split(/\r?\n/) : [];
  const incomingLines = incoming.length > 0 ? incoming.split(/\r?\n/) : [];
  const m = baseLines.length;
  const n = incomingLines.length;
  if (m === 0 && n === 0) {
    return '';
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (baseLines[i] === incomingLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (baseLines[i] === incomingLines[j]) {
      out.push(` ${baseLines[i]}`);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${baseLines[i]}`);
      i += 1;
    } else {
      out.push(`+${incomingLines[j]}`);
      j += 1;
    }
  }
  while (i < m) {
    out.push(`-${baseLines[i]}`);
    i += 1;
  }
  while (j < n) {
    out.push(`+${incomingLines[j]}`);
    j += 1;
  }
  return out.join('\n');
}

const MERGE_ACK_INSTRUCTION = 'Task: acknowledge merged content by replying "Merge received" but take no other action.';

function buildMergeAckMessage(mergeNode: NodeRecord): string {
  const summary = mergeNode.type === 'merge' ? mergeNode.mergeSummary ?? '' : '';
  const payload = mergeNode.type === 'merge' ? mergeNode.mergedAssistantContent ?? '' : '';
  const diff = mergeNode.type === 'merge' ? mergeNode.canvasDiff ?? '' : '';
  const header = mergeNode.type === 'merge' ? `Merged from ${mergeNode.mergeFrom}` : 'Merged content';
  const sections = [
    header,
    `Merge summary:\n${summary}`,
    `Merged payload:\n${payload}`,
    `Canvas diff:\n${diff}`,
    MERGE_ACK_INSTRUCTION
  ];
  return sections.join('\n\n');
}

async function resolveTargetConfig(projectId: string, targetBranch: string): Promise<{ provider: LLMProvider; model: string }> {
  const branchConfigMap = await getBranchConfigMap(projectId);
  return branchConfigMap[targetBranch] ?? resolveBranchConfig();
}

async function appendMergeAckNodes(options: {
  projectId: string;
  targetBranch: string;
  targetRefId?: string | null;
  mergeNode: NodeRecord;
}) {
  const { projectId, targetBranch, targetRefId, mergeNode } = options;
  const targetConfig = await resolveTargetConfig(projectId, targetBranch);
  const provider = targetConfig.provider;
  const modelName = targetConfig.model;
  const apiKey = await requireUserApiKeyForProvider(provider);
  const thinking = getDefaultThinkingSetting(provider, modelName);
  const thinkingValidation = validateThinkingSetting(provider, modelName, thinking);
  if (!thinkingValidation.ok) {
    throw new Error(thinkingValidation.message ?? 'Invalid thinking setting');
  }

  const tokenLimit = await getProviderTokenLimit(provider, modelName);
  const systemContext = await buildChatContext(projectId, { tokenLimit, ref: targetBranch, limit: 1 });
  // TODO(#388): cap merge canvas diff size for auto-ack to avoid oversized prompts.
  const userContent = buildMergeAckMessage(mergeNode);
  const messages = [
    { role: 'system' as const, content: systemContext.systemPrompt },
    { role: 'user' as const, content: userContent }
  ];
  const previousResponseId =
    provider === 'openai_responses'
      ? await getPreviousResponseId(projectId, { id: targetRefId, name: targetBranch }).catch(() => null)
      : null;

  let assistantText = '';
  let rawResponse: unknown = null;
  let responseId: string | null = null;
  for await (const chunk of streamAssistantCompletion({
    messages,
    provider,
    model: modelName,
    thinking,
    webSearch: false,
    apiKey,
    previousResponseId
  })) {
    if (chunk.type === 'raw_response') {
      rawResponse = chunk.payload ?? null;
      if (rawResponse && typeof rawResponse === 'object' && (rawResponse as any).responseId) {
        responseId = String((rawResponse as any).responseId);
      }
      continue;
    }
    if (chunk.type !== 'text') continue;
    if (!chunk.content) continue;
    assistantText += chunk.content;
  }

  const contentText = assistantText.trim().length > 0 ? assistantText : 'Merge received';
  const userContentBlocks = buildTextBlock(userContent);
  const assistantContentBlocks = buildTextBlock(contentText);
  const rawResponseForStorage = toJsonValue(rawResponse);

  const store = getStoreConfig();
  if (store.mode === 'pg') {
    if (!targetRefId) {
      throw new Error('Target ref id is required for merge acknowledgement');
    }
    const { rtGetHistoryShadowV2 } = await import('@/src/store/pg/reads');
    const { rtAppendNodeToRefShadowV2 } = await import('@/src/store/pg/nodes');
    const last = await rtGetHistoryShadowV2({ projectId, refId: targetRefId, limit: 1 }).catch(() => []);
    const lastNode = last[0]?.nodeJson as NodeRecord | undefined;
    const parentId = lastNode?.id ? String(lastNode.id) : null;
    const userNode = {
      id: uuidv4(),
      type: 'message',
      role: 'user',
      content: userContent,
      contentBlocks: userContentBlocks,
      uiHidden: true,
      timestamp: Date.now(),
      parent: parentId,
      createdOnBranch: targetBranch,
      contextWindow: [],
      tokensUsed: undefined
    };
    await rtAppendNodeToRefShadowV2({
      projectId,
      refId: targetRefId,
      kind: userNode.type,
      role: userNode.role,
      contentJson: userNode,
      nodeId: userNode.id,
      commitMessage: 'merge_ack_user',
      attachDraft: false
    });
    const assistantNode = {
      id: uuidv4(),
      type: 'message',
      role: 'assistant',
      content: contentText,
      contentBlocks: assistantContentBlocks,
      uiHidden: true,
      timestamp: Date.now(),
      parent: userNode.id,
      createdOnBranch: targetBranch,
      modelUsed: modelName,
      responseId: responseId ?? undefined,
      interrupted: false,
      rawResponse: rawResponseForStorage
    };
    await rtAppendNodeToRefShadowV2({
      projectId,
      refId: targetRefId,
      kind: assistantNode.type,
      role: assistantNode.role,
      contentJson: assistantNode,
      nodeId: assistantNode.id,
      commitMessage: 'merge_ack_assistant',
      attachDraft: false,
      rawResponse: rawResponseForStorage
    });
  } else {
    const { appendNodeToRefNoCheckout } = await import('@git/nodes');
    await appendNodeToRefNoCheckout(projectId, targetBranch, {
      type: 'message',
      role: 'user',
      content: userContent,
      contentBlocks: userContentBlocks,
      uiHidden: true,
      contextWindow: [],
      tokensUsed: undefined
    });
    await appendNodeToRefNoCheckout(projectId, targetBranch, {
      type: 'message',
      role: 'assistant',
      content: contentText,
      contentBlocks: assistantContentBlocks,
      uiHidden: true,
      modelUsed: modelName,
      responseId: responseId ?? undefined,
      interrupted: false,
      rawResponse: rawResponseForStorage
    });
  }

  if (provider === 'openai_responses' && responseId) {
    await setPreviousResponseId(projectId, { id: targetRefId, name: targetBranch }, responseId);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectEditor({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = mergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { sourceBranch, mergeSummary, targetBranch, sourceAssistantNodeId, leaseSessionId } = parsed.data;
    const resolvedTargetBranch = targetBranch ?? (await getPreferredBranch(params.id));

    return await withProjectLockAndRefLock(params.id, resolvedTargetBranch, async () => {
      try {
        if (store.mode === 'pg') {
          const { rtListRefsShadowV2, rtGetHistoryShadowV2, rtGetCanvasShadowV2 } = await import('@/src/store/pg/reads');
          const { rtMergeOursShadowV2 } = await import('@/src/store/pg/merge');

          const branches = await rtListRefsShadowV2({ projectId: params.id });
          const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
          const targetName = resolvedTargetBranch ?? trunkName;
          if (targetName === sourceBranch) {
            throw badRequest('Cannot merge a branch into itself');
          }
          const sourceExists = branches.some((b) => b.name === sourceBranch);
          const targetExists = branches.some((b) => b.name === targetName);
          if (!sourceExists) {
            throw badRequest(`Branch ${sourceBranch} does not exist`);
          }
          if (!targetExists) {
            throw badRequest(`Target branch ${targetName} does not exist`);
          }
          const sourceBranchInfo = branches.find((b) => b.name === sourceBranch);
          const targetBranchInfo = branches.find((b) => b.name === targetName);
          if (!sourceBranchInfo?.id || !targetBranchInfo?.id) {
            throw badRequest('Branch is missing ref id');
          }
          const sourceHeadCommit = sourceBranchInfo.headCommit ?? '';

          await acquireBranchLease({ projectId: params.id, refId: targetBranchInfo.id, leaseSessionId });
          await acquireBranchLease({ projectId: params.id, refId: sourceBranchInfo.id, leaseSessionId });

          const [targetRows, sourceRows] = await Promise.all([
            rtGetHistoryShadowV2({ projectId: params.id, refId: targetBranchInfo.id, limit: 500 }),
            rtGetHistoryShadowV2({ projectId: params.id, refId: sourceBranchInfo.id, limit: 500 })
          ]);
          const targetNodes = targetRows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
          const sourceNodes = sourceRows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
          const parentId = targetNodes[targetNodes.length - 1]?.id ?? null;
          const targetIds = new Set(targetNodes.map((n) => n.id));
          const sourceSpecific = sourceNodes.filter((n) => !targetIds.has(n.id));

          const resolvedPayloadNode =
            sourceAssistantNodeId?.trim().length
              ? sourceSpecific.find((n) => n.type === 'message' && n.id === sourceAssistantNodeId)
              : [...sourceSpecific]
                  .reverse()
                  .find((n) => n.type === 'message' && n.role === 'assistant' && n.content?.trim().length);

          if (sourceAssistantNodeId?.trim().length) {
            if (!resolvedPayloadNode) {
              throw badRequest(
                `Source assistant node ${sourceAssistantNodeId} not found on ${sourceBranch} (or is not unique to that branch)`
              );
            }
            if (resolvedPayloadNode.type !== 'message' || resolvedPayloadNode.role !== 'assistant') {
              throw badRequest('sourceAssistantNodeId must reference an assistant message node');
            }
          } else if (!resolvedPayloadNode) {
            throw badRequest(`No assistant message found on ${sourceBranch} to merge`);
          }

          const mergedAssistantNodeId =
            resolvedPayloadNode && resolvedPayloadNode.type === 'message' && resolvedPayloadNode.role === 'assistant'
              ? resolvedPayloadNode.id
              : undefined;
          const mergedAssistantContent =
            resolvedPayloadNode && resolvedPayloadNode.type === 'message' && resolvedPayloadNode.role === 'assistant'
              ? resolvedPayloadNode.content
              : undefined;

          const [targetCanvas, sourceCanvas] = await Promise.all([
            rtGetCanvasShadowV2({ projectId: params.id, refId: targetBranchInfo.id }),
            rtGetCanvasShadowV2({ projectId: params.id, refId: sourceBranchInfo.id })
          ]);
          const canvasDiff = buildLineDiff(targetCanvas.content ?? '', sourceCanvas.content ?? '');

          const mergeNode: NodeRecord = {
            id: uuidv4(),
            type: 'merge',
            mergeFrom: sourceBranch,
            mergeSummary,
            sourceCommit: sourceHeadCommit,
            sourceNodeIds: sourceSpecific.map((n) => n.id),
            canvasDiff: canvasDiff || undefined,
            mergedAssistantNodeId,
            mergedAssistantContent,
            timestamp: Date.now(),
            parent: parentId,
            createdOnBranch: targetName
          };

          await rtMergeOursShadowV2({
            projectId: params.id,
            targetRefId: targetBranchInfo.id,
            sourceRefId: sourceBranchInfo.id,
            mergeNodeId: mergeNode.id,
            mergeNodeJson: mergeNode,
            commitMessage: 'merge'
          });

          try {
            await appendMergeAckNodes({
              projectId: params.id,
              targetBranch: targetName,
              targetRefId: targetBranchInfo.id,
              mergeNode
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[merge] auto-ack failed', { projectId: params.id, targetBranch: targetName, message });
          }

          return Response.json({ mergeNode });
        }

        const { getProject } = await import('@git/projects');
        const { mergeBranch } = await import('@git/branches');

        const project = await getProject(params.id);
        if (!project) {
          throw notFound('Project not found');
        }

        const mergeNode = await mergeBranch(project.id, sourceBranch, mergeSummary, {
          targetBranch: resolvedTargetBranch,
          sourceAssistantNodeId: sourceAssistantNodeId?.trim() || undefined
        });

        try {
          await appendMergeAckNodes({
            projectId: project.id,
            targetBranch: resolvedTargetBranch,
            mergeNode
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[merge] auto-ack failed', { projectId: project.id, targetBranch: resolvedTargetBranch, message });
        }

        return Response.json({ mergeNode });
      } catch (err) {
        const message = (err as Error)?.message ?? 'Merge failed';
        if (message.toLowerCase().includes('does not exist')) {
          throw badRequest(message);
        }
        if (message.toLowerCase().includes('cannot merge')) {
          throw badRequest(message);
        }
        throw err;
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
