import { getProject } from '@git/projects';
import { listBranches } from '@git/branches';
import { getCurrentBranchName, readNodesFromRef } from '@git/utils';
import { getStarredNodeIds } from '@git/stars';
import { handleRouteError, notFound } from '@/src/server/http';
import { INITIAL_BRANCH } from '@git/constants';
import type { NodeRecord } from '@git/types';

interface RouteContext {
  params: { id: string };
}

const MAX_PER_BRANCH = 500;

function capNodesForGraph(nodes: NodeRecord[], max: number): NodeRecord[] {
  if (max <= 0) return [];
  if (nodes.length <= max) return nodes;
  if (max === 1) return [nodes[nodes.length - 1]!];
  // Keep the root node as an anchor, plus the newest (max - 1) nodes.
  return [nodes[0]!, ...nodes.slice(-(max - 1))];
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
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
          return [branch.name, capNodesForGraph(nodes, MAX_PER_BRANCH)] as const;
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

