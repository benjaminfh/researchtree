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
      const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
      const currentBranch = (await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: trunkName })).refName;

      const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
        Promise.all(
          branches.map(async (branch) => {
            if (!branch.id) {
              return [branch.name, [] as NodeRecord[]] as [string, NodeRecord[]];
            }
            const rows = await rtGetHistoryShadowV2({ projectId: params.id, refId: branch.id, limit: MAX_PER_BRANCH });
            const nodes = rows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
            const visible = nodes.filter((node) => !isHiddenMessage(node));
            return [branch.name, capNodesForGraph(visible, MAX_PER_BRANCH)] as [string, NodeRecord[]];
          })
        ),
        rtGetStarredNodeIdsShadowV1({ projectId: params.id })
      ]);

      const branchHistories: Record<string, NodeRecord[]> = {};
      for (const [branchName, nodes] of branchHistoriesEntries) {
        branchHistories[branchName] = nodes;
      }

      return Response.json({
        branches,
        trunkName,
        currentBranch,
        branchHistories,
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
    const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
    const currentBranch = await getCurrentBranchName(project.id).catch(() => trunkName);

    const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
      Promise.all(
        branches.map(async (branch) => {
          const nodes = await readNodesFromRef(project.id, branch.name);
          const visible = nodes.filter((node) => !isHiddenMessage(node));
          return [branch.name, capNodesForGraph(visible, MAX_PER_BRANCH)] as [string, NodeRecord[]];
        })
      ),
      getStarredNodeIds(project.id)
    ]);

    const branchHistories: Record<string, NodeRecord[]> = {};
    for (const [branchName, nodes] of branchHistoriesEntries) {
      branchHistories[branchName] = nodes;
    }

    return Response.json({
      branches,
      trunkName,
      currentBranch,
      branchHistories,
      starredNodeIds
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
