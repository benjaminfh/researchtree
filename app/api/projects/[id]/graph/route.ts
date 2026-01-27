// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { handleRouteError, notFound } from '@/src/server/http';
import { INITIAL_BRANCH } from '@git/constants';
import type { NodeRecord } from '@git/types';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';
import { buildGraphPayload } from '@/src/shared/graph/buildGraph';

interface RouteContext {
  params: { id: string };
}

const MAX_PER_BRANCH = 500;

function resolveRefName(refId: string | null, refNameById: Map<string, string>, label: string): string {
  if (!refId) {
    console.error('[graph] missing ref id for node label', { label });
    // TODO: remove "unknown" fallback once legacy rows are backfilled with ref IDs.
    return 'unknown';
  }
  const refName = refNameById.get(refId);
  if (!refName) {
    console.error('[graph] ref id not found for node label', { label, refId });
    // TODO: remove "unknown" fallback once legacy rows are backfilled with ref IDs.
    return 'unknown';
  }
  return refName;
}

function applyRefNames(
  rows: { nodeJson: NodeRecord; createdOnRefId: string | null; mergeFromRefId: string | null }[],
  refNameById: Map<string, string>
): NodeRecord[] {
  return rows.map((row) => {
    const createdOnBranch = resolveRefName(row.createdOnRefId, refNameById, 'createdOnBranch');
    const node = row.nodeJson;
    const mergeFrom =
      node.type === 'merge' ? resolveRefName(row.mergeFromRefId, refNameById, 'mergeFrom') : undefined;
    return {
      ...node,
      createdOnBranch,
      ...(node.type === 'merge' ? { mergeFrom } : {})
    } as NodeRecord;
  });
}

function capNodesForGraph(nodes: NodeRecord[], max: number): NodeRecord[] {
  if (max <= 0) return [];
  if (nodes.length <= max) return nodes;
  if (max === 1) return [nodes[nodes.length - 1]!];
  // Keep the root node as an anchor, plus the newest (max - 1) nodes.
  return [nodes[0]!, ...nodes.slice(-(max - 1))];
}

function capNodesForGraphWithFork(nodes: NodeRecord[], max: number, branchName: string): NodeRecord[] {
  if (max <= 0) return [];
  if (nodes.length <= max) return nodes;
  const root = nodes[0];
  const forkNode = nodes.find((node) => node.createdOnBranch === branchName && node.parent);
  const result: NodeRecord[] = [];
  const seen = new Set<string>();
  const pushUnique = (node?: NodeRecord | null) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    result.push(node);
  };
  pushUnique(root);
  pushUnique(forkNode);

  for (let i = nodes.length - 1; i >= 0 && result.length < max; i -= 1) {
    pushUnique(nodes[i]);
  }

  return result;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });
    const { searchParams } = new URL(_request.url);
    const includeHidden = searchParams.get('includeHidden') === 'true';

    if (store.mode === 'pg') {
      const { rtListRefsShadowV2, rtGetHistoryShadowV2, rtGetStarredNodeIdsShadowV1 } = await import('@/src/store/pg/reads');
      const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');

      const branches = await rtListRefsShadowV2({ projectId: params.id });
      const visibleBranches = includeHidden ? branches : branches.filter((branch) => !branch.isHidden);
      const refNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
      const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
      const currentBranch = (await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: trunkName })).refName;

      const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
        Promise.all(
          visibleBranches.map(async (branch) => {
            if (!branch.id) {
              return [branch.name, [] as NodeRecord[]] as [string, NodeRecord[]];
            }
            const rows = await rtGetHistoryShadowV2({ projectId: params.id, refId: branch.id, limit: MAX_PER_BRANCH });
            const nodes = applyRefNames(rows.filter((r) => Boolean(r.nodeJson)) as any, refNameById);
            return [branch.name, capNodesForGraphWithFork(nodes, MAX_PER_BRANCH, branch.name)] as [string, NodeRecord[]];
          })
        ),
        rtGetStarredNodeIdsShadowV1({ projectId: params.id })
      ]);

      const branchHistories: Record<string, NodeRecord[]> = {};
      for (const [branchName, nodes] of branchHistoriesEntries) {
        branchHistories[branchName] = nodes;
      }

      const graph = buildGraphPayload({
        branchHistories,
        trunkName,
        activeBranchName: currentBranch
      });

      return Response.json({
        branches: visibleBranches,
        trunkName,
        currentBranch,
        branchHistories,
        graph,
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
    const visibleBranches = includeHidden ? branches : branches.filter((branch) => !branch.isHidden);
    const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
    const currentBranch = await getCurrentBranchName(project.id).catch(() => trunkName);

    const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
      Promise.all(
        visibleBranches.map(async (branch) => {
          const nodes = await readNodesFromRef(project.id, branch.name);
          return [branch.name, capNodesForGraphWithFork(nodes, MAX_PER_BRANCH, branch.name)] as [string, NodeRecord[]];
        })
      ),
      getStarredNodeIds(project.id)
    ]);

    const branchHistories: Record<string, NodeRecord[]> = {};
    for (const [branchName, nodes] of branchHistoriesEntries) {
      branchHistories[branchName] = nodes;
    }

    const graph = buildGraphPayload({
      branchHistories,
      trunkName,
      activeBranchName: currentBranch
    });

    return Response.json({
      branches: visibleBranches,
      trunkName,
      currentBranch,
      branchHistories,
      graph,
      starredNodeIds
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
