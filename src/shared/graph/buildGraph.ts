// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import type { NodeRecord } from '@git/types';
import type { GraphNode } from '@/src/shared/graph';
import { features } from '@/src/config/features';
import { deriveTextFromBlocks, getContentBlocksWithLegacyFallback } from '@/src/shared/thinkingTraces';

const MERGE_ACK_INSTRUCTION = 'Task: acknowledge merged content by replying "Merge received" but take no other action.';

function isHiddenMessage(node: NodeRecord): boolean {
  return node.type === 'message' && Boolean((node as any).uiHidden);
}

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

function buildHiddenNodeIdSet(branchHistories: Record<string, NodeRecord[]>): Set<string> {
  const hiddenIds = new Set<string>();

  for (const nodes of Object.values(branchHistories)) {
    let skipNextMergeAckAssistant = false;
    for (const node of nodes) {
      if (node.type === 'state') {
        hiddenIds.add(node.id);
        continue;
      }
      if (isHiddenMessage(node)) {
        hiddenIds.add(node.id);
        continue;
      }
      if (isMergeAckUserMessage(node)) {
        hiddenIds.add(node.id);
        skipNextMergeAckAssistant = true;
        continue;
      }
      if (skipNextMergeAckAssistant && isMergeAckAssistantMessage(node)) {
        hiddenIds.add(node.id);
        skipNextMergeAckAssistant = false;
        continue;
      }
      if (node.type === 'message') {
        skipNextMergeAckAssistant = false;
      }
    }
  }

  return hiddenIds;
}

function topologicallyOrder(nodes: GraphNode[], nodeById: Map<string, NodeRecord>): GraphNode[] {
  const parentsById = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const childrenByParent = new Map<string, string[]>();

  for (const node of nodes) {
    parentsById.set(node.id, node.parents);
    indegree.set(node.id, 0);
  }

  for (const node of nodes) {
    for (const parentId of node.parents) {
      if (!indegree.has(parentId)) continue;
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      const children = childrenByParent.get(parentId) ?? [];
      children.push(node.id);
      childrenByParent.set(parentId, children);
    }
  }

  const timestampById = new Map<string, number>();
  for (const node of nodes) {
    timestampById.set(node.id, nodeById.get(node.id)?.timestamp ?? 0);
  }

  const compareReady = (a: string, b: string) => {
    const ta = timestampById.get(a) ?? 0;
    const tb = timestampById.get(b) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  };

  const ready: string[] = [];
  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) ready.push(id);
  }
  ready.sort(compareReady);

  const ordered: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordered.push(id);
    const children = childrenByParent.get(id) ?? [];
    for (const childId of children) {
      const next = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, next);
      if (next === 0) {
        ready.push(childId);
      }
    }
    ready.sort(compareReady);
  }

  if (ordered.length !== nodes.length) {
    const remaining = nodes
      .map((n) => n.id)
      .filter((id) => !ordered.includes(id))
      .sort(compareReady);
    ordered.push(...remaining);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  return ordered.map((id) => byId.get(id)!).filter(Boolean);
}

function formatLabel(node: NodeRecord) {
  if (node.type === 'merge') {
    return node.mergeSummary ? `Merge · ${node.mergeSummary}` : `Merge from ${node.mergeFrom}`;
  }
  if (node.type === 'state') {
    return 'Canvas snapshot';
  }
  if (node.type === 'message') {
    const blocks = getContentBlocksWithLegacyFallback(node);
    const text = deriveTextFromBlocks(blocks) || node.content;
    return `${text.slice(0, 42)}${text.length > 42 ? '…' : ''}`;
  }
  throw new Error('Unhandled node type');
}

function resolveVisibleAncestor(
  startId: string | null,
  nodeById: Map<string, NodeRecord>,
  hiddenNodeIds: Set<string>
): string | null {
  let current = startId;
  const seen = new Set<string>();
  while (current) {
    const node = nodeById.get(current);
    if (!node) return null;
    if (!hiddenNodeIds.has(current)) return current;
    if (seen.has(current)) return null;
    seen.add(current);
    current = node.parent ?? null;
  }
  return null;
}

function buildVisibleBranchHistories(
  branchHistories: Record<string, NodeRecord[]>,
  nodeById: Map<string, NodeRecord>,
  hiddenNodeIds: Set<string>
): Record<string, NodeRecord[]> {
  const output: Record<string, NodeRecord[]> = {};

  for (const [branchName, nodes] of Object.entries(branchHistories)) {
    const visible: NodeRecord[] = [];
    for (const node of nodes) {
      if (hiddenNodeIds.has(node.id)) continue;
      const parent = resolveVisibleAncestor(node.parent, nodeById, hiddenNodeIds);
      visible.push({ ...node, parent });
    }
    output[branchName] = visible;
  }

  return output;
}

function buildAllGraphNodes(
  nodes: NodeRecord[],
  branchHistories: Record<string, NodeRecord[]>,
  trunkName: string,
  activeBranchName: string,
  nodeById: Map<string, NodeRecord>,
  hiddenNodeIds: Set<string>
): GraphNode[] {
  const firstSeenBranchById = new Map<string, string>();
  const activeNodeIds = new Set<string>();

  const orderedBranchEntries = Object.entries(branchHistories).sort(([a], [b]) => {
    if (a === trunkName && b !== trunkName) return -1;
    if (a !== trunkName && b === trunkName) return 1;
    return a.localeCompare(b);
  });

  for (const [branchName, historyNodes] of orderedBranchEntries) {
    for (const node of historyNodes) {
      if (!firstSeenBranchById.has(node.id)) {
        firstSeenBranchById.set(node.id, branchName);
      }
      if (branchName === activeBranchName) {
        activeNodeIds.add(node.id);
      }
    }
  }

  const graphNodes: GraphNode[] = [];
  for (const node of nodes) {
    const parents: string[] = [];
    const primaryParent = resolveVisibleAncestor(node.parent, nodeById, hiddenNodeIds);
    if (primaryParent) parents.push(primaryParent);
    if (node.type === 'merge') {
      const mergeParent = node.sourceNodeIds[node.sourceNodeIds.length - 1];
      const resolvedMergeParent = resolveVisibleAncestor(mergeParent ?? null, nodeById, hiddenNodeIds);
      if (resolvedMergeParent) parents.push(resolvedMergeParent);
    }
    const inferredBranch = firstSeenBranchById.get(node.id) ?? trunkName;
    const originBranchId = node.createdOnBranch ?? inferredBranch;
    graphNodes.push({
      id: node.id,
      parents,
      originBranchId,
      laneBranchId: inferredBranch,
      isOnActiveBranch: activeNodeIds.has(node.id),
      label: formatLabel(node),
      icon:
        node.type === 'merge'
          ? 'merge'
          : node.type === 'message'
          ? node.role === 'assistant'
            ? 'assistant'
            : 'user'
          : undefined
    });
  }

  return topologicallyOrder(graphNodes, nodeById);
}

function buildCollapsedGraphNodes(
  branchHistories: Record<string, NodeRecord[]>,
  activeBranchName: string,
  trunkName: string,
  canonicalNodeById: Map<string, NodeRecord>,
  hiddenNodeIds: Set<string>
): GraphNode[] {
  const nodeById = new Map<string, NodeRecord>();
  const firstSeenBranchById = new Map<string, string>();
  const activeNodeIds = new Set<string>();
  const mergeNodeIds = new Set<string>();

  const orderedBranchEntries = Object.entries(branchHistories).sort(([a], [b]) => {
    if (a === trunkName && b !== trunkName) return -1;
    if (a !== trunkName && b === trunkName) return 1;
    return a.localeCompare(b);
  });

  for (const [branchName, nodes] of orderedBranchEntries) {
    for (const node of nodes) {
      nodeById.set(node.id, node);
      if (!firstSeenBranchById.has(node.id)) {
        firstSeenBranchById.set(node.id, branchName);
      }
      if (branchName === activeBranchName) {
        activeNodeIds.add(node.id);
      }
      if (node.type === 'merge') {
        mergeNodeIds.add(node.id);
      }
    }
  }

  const trunkHistory = branchHistories[trunkName] ?? [];
  const trunkIds = trunkHistory.map((n) => n.id);
  const activeHeadId = branchHistories[activeBranchName]?.[branchHistories[activeBranchName].length - 1]?.id ?? null;

  const important = new Set<string>();
  for (const [branchName, nodes] of orderedBranchEntries) {
    if (features.uiCollapsedBranchTwoNodes) {
      const createdOnBranch = nodes.filter((node) => node.createdOnBranch === branchName);
      if (createdOnBranch.length >= 2) {
        important.add(createdOnBranch[0].id);
        important.add(createdOnBranch[createdOnBranch.length - 1].id);
      } else if (createdOnBranch.length === 1) {
        important.add(createdOnBranch[0].id);
      }
    } else {
      const tip = nodes[nodes.length - 1];
      if (tip) important.add(tip.id);
      if (branchName !== trunkName) {
        const max = Math.min(nodes.length, trunkHistory.length);
        let idx = 0;
        while (idx < max && nodes[idx]?.id === trunkHistory[idx]?.id) idx += 1;
        const firstUnique = idx < nodes.length ? nodes[idx] : null;
        if (firstUnique) important.add(firstUnique.id);
      }
    }
    if (branchName === trunkName) continue;
    const max = Math.min(nodes.length, trunkHistory.length);
    let idx = 0;
    while (idx < max && nodes[idx]?.id === trunkHistory[idx]?.id) idx += 1;
    const forkBase = idx > 0 ? trunkHistory[idx - 1] : null;
    if (forkBase) important.add(forkBase.id);
  }
  for (const id of mergeNodeIds) important.add(id);

  if (trunkIds.length > 0) {
    important.add(trunkIds[0]);
  }
  if (activeHeadId) {
    important.add(activeHeadId);
  }

  const primaryParentById = new Map<string, string | null>();
  const mergeParentsById = new Map<string, string[]>();
  for (const [id, node] of nodeById.entries()) {
    primaryParentById.set(id, node.parent);
    if (node.type === 'merge') {
      const mergeParent = node.sourceNodeIds[node.sourceNodeIds.length - 1];
      const resolvedMergeParent = resolveVisibleAncestor(mergeParent ?? null, canonicalNodeById, hiddenNodeIds);
      mergeParentsById.set(id, resolvedMergeParent ? [resolvedMergeParent] : []);
    } else {
      mergeParentsById.set(id, []);
    }
  }

  const resolveIncludedAncestor = (
    startId: string | null
  ): { id: string | null; hiddenCount: number } => {
    let current: string | null = startId;
    const seen = new Set<string>();
    let hiddenCount = 0;
    while (current) {
      if (important.has(current)) return { id: current, hiddenCount };
      if (seen.has(current)) return { id: null, hiddenCount };
      seen.add(current);
      hiddenCount += 1;
      current = primaryParentById.get(current) ?? null;
    }
    return { id: null, hiddenCount };
  };

  const collapsedNodes: GraphNode[] = [];
  for (const id of important) {
    const node = nodeById.get(id);
    if (!node) continue;
    const inferredBranch = firstSeenBranchById.get(id) ?? trunkName;
    const originBranchId = node.createdOnBranch ?? inferredBranch;

    const parents: string[] = [];
    const hiddenCountByParent: Record<string, number> = {};
    const primary = resolveIncludedAncestor(node.parent);
    if (primary.id) {
      parents.push(primary.id);
      hiddenCountByParent[primary.id] = primary.hiddenCount;
    }
    const mergeParents = mergeParentsById.get(id) ?? [];
    for (const mergeParentId of mergeParents) {
      const resolved = resolveIncludedAncestor(mergeParentId);
      if (resolved.id && !parents.includes(resolved.id)) {
        parents.push(resolved.id);
        hiddenCountByParent[resolved.id] = resolved.hiddenCount;
      }
    }

    collapsedNodes.push({
      id,
      parents,
      originBranchId,
      laneBranchId: inferredBranch,
      isOnActiveBranch: activeNodeIds.has(id),
      label: node.type === 'merge' ? `Merge · ${node.mergeFrom}` : originBranchId,
      icon:
        node.type === 'merge'
          ? 'merge'
          : node.type === 'message'
          ? node.role === 'assistant'
            ? 'assistant'
            : 'user'
          : undefined,
      hiddenCountByParent: Object.keys(hiddenCountByParent).length > 0 ? hiddenCountByParent : undefined
    });
  }

  const timestampById = new Map<string, number>();
  for (const node of collapsedNodes) {
    timestampById.set(node.id, nodeById.get(node.id)?.timestamp ?? 0);
  }
  collapsedNodes.sort((a, b) => {
    const ta = timestampById.get(a.id) ?? 0;
    const tb = timestampById.get(b.id) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  return collapsedNodes;
}

export function buildGraphPayload({
  branchHistories,
  trunkName,
  activeBranchName
}: {
  branchHistories: Record<string, NodeRecord[]>;
  trunkName: string;
  activeBranchName: string;
}): { all: GraphNode[]; collapsed: GraphNode[] } {
  const refNames = Object.keys(branchHistories);
  const canonicalNodes: NodeRecord[] = [];
  const seen = new Set<string>();
  const nodeById = new Map<string, NodeRecord>();
  const hiddenNodeIds = buildHiddenNodeIdSet(branchHistories);

  for (const refName of refNames) {
    for (const node of branchHistories[refName] ?? []) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      canonicalNodes.push(node);
      nodeById.set(node.id, node);
    }
  }

  const visibleBranchHistories = buildVisibleBranchHistories(branchHistories, nodeById, hiddenNodeIds);
  const visibleNodes: NodeRecord[] = [];
  const seenVisible = new Set<string>();
  for (const refName of refNames) {
    for (const node of visibleBranchHistories[refName] ?? []) {
      if (seenVisible.has(node.id)) continue;
      seenVisible.add(node.id);
      visibleNodes.push(node);
    }
  }

  const all = buildAllGraphNodes(
    visibleNodes,
    visibleBranchHistories,
    trunkName,
    activeBranchName,
    nodeById,
    hiddenNodeIds
  );
  const collapsed = buildCollapsedGraphNodes(
    visibleBranchHistories,
    activeBranchName,
    trunkName,
    nodeById,
    hiddenNodeIds
  );

  return { all, collapsed };
}
