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
  return node.type === 'message' && Boolean((node as any).uiHidden);
}

const MERGE_ACK_INSTRUCTION = 'Task: acknowledge merged content by replying "Merge received" but take no other action.';

function isMergeAckUserMessage(node: NodeRecord): boolean {
  if (node.type !== 'message' || node.role !== 'user') return false;
  const content = (node.content ?? '').trim();
  return (
    content.startsWith('Merged from ') &&
    content.includes('Merge summary:') &&
    content.includes('Merged payload:') &&
    content.includes('Canvas diff:') &&
    content.includes(MERGE_ACK_INSTRUCTION)
  );
}

function isMergeAckAssistantMessage(node: NodeRecord): boolean {
  if (node.type !== 'message' || node.role !== 'assistant') return false;
  return (node.content ?? '').trim() === 'Merge received';
}

function filterVisibleGraphNodes(nodes: NodeRecord[]): NodeRecord[] {
  const filtered: NodeRecord[] = [];
  let skipNextMergeAckAssistant = false;

  for (const node of nodes) {
    // Canvas snapshots (state nodes) are created on autosave, so keep them out of the graph UI.
    if (node.type === 'state') {
      continue;
    }
    if (isHiddenMessage(node)) {
      continue;
    }
    if (isMergeAckUserMessage(node)) {
      skipNextMergeAckAssistant = true;
      continue;
    }
    if (skipNextMergeAckAssistant && isMergeAckAssistantMessage(node)) {
      skipNextMergeAckAssistant = false;
      continue;
    }
    if (node.type === 'message') {
      skipNextMergeAckAssistant = false;
    }
    filtered.push(node);
  }

  return filtered;
}

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
      const currentBranch = (await rtGetCurrentRefShadowV2({ projectId: params.id, defaultRefName: trunkName })).refName;

      const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
        Promise.all(
          visibleBranches.map(async (branch) => {
            if (!branch.id) {
              return [branch.name, [] as NodeRecord[]] as [string, NodeRecord[]];
            }
            const rows = await rtGetHistoryShadowV2({ projectId: params.id, refId: branch.id, limit: MAX_PER_BRANCH });
            const nodes = applyRefNames(rows.filter((r) => Boolean(r.nodeJson)) as any, refNameById);
            return [branch.name, capNodesForGraph(filterVisibleGraphNodes(nodes), MAX_PER_BRANCH)] as [string, NodeRecord[]];
          })
        ),
        rtGetStarredNodeIdsShadowV1({ projectId: params.id })
      ]);

      const branchHistories: Record<string, NodeRecord[]> = {};
      for (const [branchName, nodes] of branchHistoriesEntries) {
        branchHistories[branchName] = nodes;
      }

      return Response.json({
        branches: visibleBranches,
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
    const visibleBranches = branches.filter((branch) => !branch.isHidden);
    const trunkName = branches.find((b) => b.isTrunk)?.name ?? INITIAL_BRANCH;
    const currentBranch = await getCurrentBranchName(project.id).catch(() => trunkName);

    const [branchHistoriesEntries, starredNodeIds] = await Promise.all([
      Promise.all(
        visibleBranches.map(async (branch) => {
          const nodes = await readNodesFromRef(project.id, branch.name);
          return [branch.name, capNodesForGraph(filterVisibleGraphNodes(nodes), MAX_PER_BRANCH)] as [string, NodeRecord[]];
        })
      ),
      getStarredNodeIds(project.id)
    ]);

    const branchHistories: Record<string, NodeRecord[]> = {};
    for (const [branchName, nodes] of branchHistoriesEntries) {
      branchHistories[branchName] = nodes;
    }

    return Response.json({
      branches: visibleBranches,
      trunkName,
      currentBranch,
      branchHistories,
      starredNodeIds
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
