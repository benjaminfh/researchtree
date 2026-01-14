// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { mergeRequestSchema } from '@/src/server/schemas';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { ensureBranchLease } from '@/src/server/leases';
import type { NodeRecord } from '@git/types';
import { INITIAL_BRANCH } from '@git/constants';
import { v4 as uuidv4 } from 'uuid';

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

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

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
          await ensureBranchLease({ projectId: params.id, refId: targetBranchInfo.id, sessionId: leaseSessionId });
          const sourceHeadCommit = sourceBranchInfo.headCommit ?? '';

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
