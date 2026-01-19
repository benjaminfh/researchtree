// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, notFound } from '@/src/server/http';
import { INITIAL_BRANCH } from '@git/constants';
import type { NodeRecord } from '@git/types';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';

interface RouteContext {
  params: { id: string };
}

const MAX_PER_BRANCH = 500;

function applyRefNames(nodes: NodeRecord[], refNameById: Map<string, string>): NodeRecord[] {
  if (refNameById.size === 0) return nodes;
  return nodes.map((node) => {
    const createdOn = node.createdOnRefId ? refNameById.get(node.createdOnRefId) : undefined;
    const mergeFrom = node.type === 'merge' && node.mergeFromRefId ? refNameById.get(node.mergeFromRefId) : undefined;
    if (!createdOn && !mergeFrom) return node;
    return {
      ...node,
      createdOnBranch: createdOn ?? node.createdOnBranch,
      ...(node.type === 'merge' ? { mergeFrom: mergeFrom ?? node.mergeFrom } : {})
    } as NodeRecord;
  });
}

function isHiddenMessage(node: NodeRecord): boolean {
  return node.type === 'message' && node.role === 'user' && Boolean((node as any).uiHidden);
}

function capNodesForGraph(nodes: NodeRecord[], max: number): NodeRecord[] {
  if (max <= 0) return [];
  if (nodes.length <= max) return nodes;
  if (max === 1) return [nodes[nodes.length - 1]!];
  // Keep the root node as an anchor, plus the newest (max - 1) nodes.
  return [nodes[0]!, ...nodes.slice(-(max - 1))];
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode === 'pg') {
      const { rtListRefsShadowV2, rtGetHistoryShadowV2, rtGetStarredNodeIdsShadowV1 } = await import('@/src/store/pg/reads');
      const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');

      const branches = await rtListRefsShadowV2({ projectId: params.id });
      const visibleBranches = branches.filter((branch) => !branch.isHidden);
      const refNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
      const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
      const trunkId = branches.find((b) => b.isTrunk)?.id ?? null;
      const current = await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: trunkName });
      const currentBranch = current.refName;
      const currentBranchId = branches.find((branch) => branch.name === currentBranch)?.id ?? current.refId;

      const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
        Promise.all(
          visibleBranches.map(async (branch) => {
            if (!branch.id) {
              return [branch.name, [] as NodeRecord[]] as [string, NodeRecord[]];
            }
            const rows = await rtGetHistoryShadowV2({ projectId: params.id, refId: branch.id, limit: MAX_PER_BRANCH });
            const nodes = rows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
            const resolved = applyRefNames(nodes, refNameById);
            const visible = resolved.filter((node) => !isHiddenMessage(node));
            return [branch.id, capNodesForGraph(visible, MAX_PER_BRANCH)] as [string, NodeRecord[]];
          })
        ),
        rtGetStarredNodeIdsShadowV1({ projectId: params.id })
      ]);

      const branchHistoriesById: Record<string, NodeRecord[]> = {};
      for (const [branchId, nodes] of branchHistoriesEntries) {
        branchHistoriesById[branchId] = nodes;
      }
      const branchNameById = Object.fromEntries(branches.map((branch) => [branch.id, branch.name]));

      return Response.json({
        branches: visibleBranches,
        trunkName,
        trunkId,
        currentBranch,
        currentBranchId,
        branchHistoriesById,
        branchNameById,
        starredNodeIds
      });
    }

    const { getProject } = await import('@git/projects');
    const { listBranches } = await import('@git/branches');
    const { getCurrentBranchName, readNodesFromRef } = await import('@git/utils');
    const { getStarredNodeIds } = await import('@git/stars');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const branches = await listBranches(project.id);
    const visibleBranches = branches.filter((branch) => !branch.isHidden);
    const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
    const trunkId = branches.find((b) => b.isTrunk)?.id ?? null;
    const currentBranch = await getCurrentBranchName(project.id).catch(() => trunkName);
    const currentBranchId = branches.find((branch) => branch.name === currentBranch)?.id ?? null;

    const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
      Promise.all(
        visibleBranches.map(async (branch) => {
          const nodes = await readNodesFromRef(project.id, branch.name);
          const visible = nodes.filter((node) => !isHiddenMessage(node));
          return [branch.id ?? branch.name, capNodesForGraph(visible, MAX_PER_BRANCH)] as [string, NodeRecord[]];
        })
      ),
      getStarredNodeIds(project.id)
    ]);

    const branchHistoriesById: Record<string, NodeRecord[]> = {};
    for (const [branchId, nodes] of branchHistoriesEntries) {
      branchHistoriesById[branchId] = nodes;
    }
    const branchNameById = Object.fromEntries(visibleBranches.map((branch) => [branch.id ?? branch.name, branch.name]));

    return Response.json({
      branches: visibleBranches,
      trunkName,
      trunkId,
      currentBranch,
      currentBranchId,
      branchHistoriesById,
      branchNameById,
      starredNodeIds
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
