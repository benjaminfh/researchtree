// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { withProjectRefLock } from '@/src/server/locks';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { pinCanvasDiffSchema } from '@/src/server/schemas';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { v4 as uuidv4 } from 'uuid';
import { buildTextBlock } from '@/src/server/llmContentBlocks';
import { acquireBranchLease } from '@/src/server/leases';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { resolveCurrentRef } = await import('@/src/server/pgRefs');
    return (await resolveCurrentRef(projectId, 'main')).name;
  }
  const { getCurrentBranchName } = await import('@git/utils');
  return getCurrentBranchName(projectId).catch(() => 'main');
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = pinCanvasDiffSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { mergeNodeId, targetBranch, leaseSessionId } = parsed.data;
    const resolvedTargetBranch = targetBranch ?? (await getPreferredBranch(params.id));

    return await withProjectRefLock(params.id, resolvedTargetBranch, async () => {
      if (store.mode === 'pg') {
        const { rtGetHistoryShadowV2 } = await import('@/src/store/pg/reads');
        const { rtAppendNodeToRefShadowV2 } = await import('@/src/store/pg/nodes');
        const { resolveRefByName } = await import('@/src/server/pgRefs');
        const targetRef = await resolveRefByName(params.id, resolvedTargetBranch);
        await acquireBranchLease({ projectId: params.id, refId: targetRef.id, leaseSessionId });
        const rows = await rtGetHistoryShadowV2({ projectId: params.id, refId: targetRef.id, limit: 500 });
        const nodes = rows.map((r) => r.nodeJson).filter(Boolean) as any[];
        const mergeNode = nodes.find((node) => node.type === 'merge' && String(node.id) === mergeNodeId);
        if (!mergeNode || mergeNode.type !== 'merge') {
          throw badRequest('Merge node not found on target branch');
        }
        if (!mergeNode.canvasDiff?.trim()) {
          throw badRequest('Merge node has no canvas diff');
        }

        const existing = nodes.find(
          (node) => node.type === 'message' && node.role === 'assistant' && node.pinnedFromMergeId === mergeNodeId
        );
        if (existing && existing.type === 'message') {
          return Response.json({ pinnedNode: existing, alreadyPinned: true });
        }

        const parentId = nodes.length > 0 ? String(nodes[nodes.length - 1]!.id) : null;
        const pinnedNode = {
          id: uuidv4(),
          type: 'message',
          role: 'assistant',
          content: mergeNode.canvasDiff,
          contentBlocks: buildTextBlock(mergeNode.canvasDiff),
          pinnedFromMergeId: mergeNodeId,
          timestamp: Date.now(),
          parent: parentId,
          createdOnBranch: resolvedTargetBranch
        };

        await rtAppendNodeToRefShadowV2({
          projectId: params.id,
          refId: targetRef.id,
          kind: pinnedNode.type,
          role: pinnedNode.role,
          contentJson: pinnedNode,
          nodeId: pinnedNode.id,
          commitMessage: 'pin_canvas_diff',
          attachDraft: false
        });

        return Response.json({ pinnedNode, alreadyPinned: false });
      }

      const { getProject } = await import('@git/projects');
      const { readNodesFromRef } = await import('@git/utils');
      const { appendNodeToRefNoCheckout } = await import('@git/nodes');

      const project = await getProject(params.id);
      if (!project) {
        throw notFound('Project not found');
      }

      const nodes = await readNodesFromRef(project.id, resolvedTargetBranch);
      const mergeNode = nodes.find((node) => node.type === 'merge' && node.id === mergeNodeId);
      if (!mergeNode || mergeNode.type !== 'merge') {
        throw badRequest('Merge node not found on target branch');
      }
      if (!mergeNode.canvasDiff?.trim()) {
        throw badRequest('Merge node has no canvas diff');
      }

      const existing = nodes.find(
        (node) => node.type === 'message' && node.role === 'assistant' && node.pinnedFromMergeId === mergeNodeId
      );
      if (existing && existing.type === 'message') {
        return Response.json({ pinnedNode: existing, alreadyPinned: true });
      }

      const pinnedNode = await appendNodeToRefNoCheckout(project.id, resolvedTargetBranch, {
        type: 'message',
        role: 'assistant',
        content: mergeNode.canvasDiff,
        contentBlocks: buildTextBlock(mergeNode.canvasDiff),
        pinnedFromMergeId: mergeNodeId
      });

      return Response.json({ pinnedNode, alreadyPinned: false });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
