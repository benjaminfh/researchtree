'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  type Edge,
  type EdgeProps,
  Handle,
  type ReactFlowInstance,
  type Viewport,
  type Node,
  type NodeProps,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodeRecord } from '@git/types';
import { getBranchColor } from './branchColors';
import { InsightFrame } from './InsightFrame';
import { ArrowLeftCircleIcon, CpuChipIcon, UserIcon } from './HeroIcons';

interface WorkspaceGraphProps {
  branchHistories: Record<string, NodeRecord[]>;
  activeBranchName: string;
  trunkName: string;
  mode?: 'nodes' | 'collapsed' | 'starred';
  starredNodeIds?: string[];
  onModeChange?: (mode: 'nodes' | 'collapsed' | 'starred') => void;
}

interface DotNodeData {
  label: string;
  color: string;
  isActive: boolean;
  icon?: 'assistant' | 'user' | 'merge';
  labelTranslateX: number;
}

interface GitEdgeData {
  color: string;
  style: 'angular' | 'curve';
  lockedFirst: boolean;
}

const rowSpacing = 45;
const laneSpacing = 18;
const NULL_VERTEX_ID = -1;
const DEFAULT_VIEWPORT = { x: 48, y: 88, zoom: 1 } as const;
const BOTTOM_VIEWPORT_PADDING = 56;
const LABEL_BASE_OFFSET = 24; // icon (16) + gap (8)
const LABEL_ROW_GAP = 20; // gap after the right-most line when the node isn't on it

const DotNode = ({ data }: NodeProps<DotNodeData>) => (
  <div className="relative flex items-center gap-2">
    <Handle
      type="target"
      position={Position.Top}
      className="!h-2 !w-2 !border-0 !bg-transparent"
      style={{ left: 5, top: -2, opacity: 0 }}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      className="!h-2 !w-2 !border-0 !bg-transparent"
      style={{ left: 5, bottom: -2, opacity: 0 }}
    />
    <span
      className="inline-flex"
      style={{
        color: data.color,
        filter: data.isActive ? `drop-shadow(0 0 0 ${data.color}66)` : 'none'
      }}
    >
      {data.icon === 'assistant' ? (
        <CpuChipIcon className="h-4 w-4" />
      ) : data.icon === 'user' ? (
        <UserIcon className="h-4 w-4" />
      ) : data.icon === 'merge' ? (
        <ArrowLeftCircleIcon className="h-4 w-4" />
      ) : (
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: data.color }} />
      )}
    </span>
    <span
      className="max-w-[360px] truncate whitespace-nowrap text-sm font-medium text-slate-800"
      style={{ transform: `translateX(${data.labelTranslateX}px)` }}
    >
      {data.label}
    </span>
  </div>
);

const GitEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<GitEdgeData>) => {
  const path =
    data?.style === 'curve'
      ? buildCurvePath(sourceX, sourceY, targetX, targetY)
      : buildAngularPath(sourceX, sourceY, targetX, targetY, data?.lockedFirst);
  return (
    <path
      d={path}
      fill="none"
      className="react-flow__edge-path"
      stroke={data?.color ?? '#94a3b8'}
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
};

const nodeTypes = { dot: DotNode };
const edgeTypes = { git: GitEdge };

function buildAngularPath(sx: number, sy: number, tx: number, ty: number, lockedFirst?: boolean) {
  if (sx === tx) {
    return `M ${sx},${sy} L ${tx},${ty}`;
  }
  const d = Math.abs(ty - sy) * 0.38;
  if (lockedFirst) {
    return `M ${sx},${sy} L ${tx},${ty - d} L ${tx},${ty}`;
  }
  return `M ${sx},${sy} L ${sx},${sy + d} L ${tx},${ty}`;
}

function buildCurvePath(sx: number, sy: number, tx: number, ty: number) {
  const d = Math.abs(ty - sy) * 0.8;
  return `M ${sx},${sy} C ${sx},${sy + d} ${tx},${ty - d} ${tx},${ty}`;
}

export interface GraphNode {
  id: string;
  parents: string[];
  originBranchId: string;
  laneBranchId: string;
  isOnActiveBranch: boolean;
  label: string;
  icon?: 'assistant' | 'user' | 'merge';
}

interface Point {
  x: number;
  y: number;
}

interface Connection {
  connectsTo: Vertex | null;
  onBranch: Branch;
}

class Branch {
  private end = 0;
  constructor(private colour: number) {}

  public getColour() {
    return this.colour;
  }

  public setEnd(end: number) {
    this.end = end;
  }

  public getEnd() {
    return this.end;
  }

  public addLine(_p1: Point, _p2: Point, _lockedFirst: boolean) {
    // Placeholder for future path rendering.
  }
}

class Vertex {
  private children: Vertex[] = [];
  private parents: (Vertex | null)[] = [];
  private nextParent = 0;
  private onBranch: Branch | null = null;
  private x = 0;
  private nextX = 0;
  private connections: (Connection | undefined)[] = [];

  constructor(public readonly id: number) {}

  addChild(vertex: Vertex) {
    this.children.push(vertex);
  }

  addParent(vertex: Vertex | null) {
    this.parents.push(vertex);
  }

  getNextParent(): Vertex | null {
    return this.parents[this.nextParent] ?? null;
  }

  registerParentProcessed() {
    this.nextParent += 1;
  }

  isMerge() {
    return this.parents.filter((parent) => parent && parent.id !== NULL_VERTEX_ID).length > 1;
  }

  addToBranch(branch: Branch, lane: number) {
    if (this.onBranch === null) {
      this.onBranch = branch;
      this.x = lane;
    }
  }

  isNotOnBranch() {
    return this.onBranch === null;
  }

  getBranch() {
    return this.onBranch;
  }

  getLane() {
    return this.x;
  }

  getMaxReservedX() {
    return Math.max(this.x, this.nextX - 1, this.connections.length - 1);
  }

  getPoint(): Point {
    return { x: this.x, y: this.id };
  }

  getNextPoint(): Point {
    return { x: this.nextX, y: this.id };
  }

  getPointConnectingTo(vertex: Vertex | null, branch: Branch): Point | null {
    for (let i = 0; i < this.connections.length; i++) {
      const connection = this.connections[i];
      if (connection && connection.connectsTo === vertex && connection.onBranch === branch) {
        return { x: i, y: this.id };
      }
    }
    return null;
  }

  registerUnavailablePoint(x: number, connectsTo: Vertex | null, onBranch: Branch) {
    if (x === this.nextX) {
      this.nextX = x + 1;
    }
    this.connections[x] = { connectsTo, onBranch };
  }
}

class GitGraphLayout {
  private vertices: Vertex[] = [];
  private availableColours: number[] = [];
  private branches: Branch[] = [];
  private nodeIndex = new Map<string, number>();
  private nullVertex = new Vertex(NULL_VERTEX_ID);

  private completed = false;
  private iterations = 0;

  constructor(private readonly nodes: GraphNode[], private readonly maxIterations: number) {}

  public compute(): boolean {
    this.vertices = this.nodes.map((_, index) => new Vertex(index));
    this.nodeIndex = new Map(this.nodes.map((node, index) => [node.id, index]));
    this.nodes.forEach((node) => {
      node.parents = node.parents.filter((parent, idx) => node.parents.indexOf(parent) === idx);
    });
    this.nodes.forEach((node, index) => {
      node.parents.forEach((parentId) => {
        const parentIndex = this.nodeIndex.get(parentId);
        const parentVertex = typeof parentIndex === 'number' ? this.vertices[parentIndex] : this.nullVertex;
        this.vertices[index].addParent(parentVertex);
        if (parentVertex !== this.nullVertex) {
          parentVertex.addChild(this.vertices[index]);
        }
      });
    });

    let i = 0;
    this.iterations = 0;
    // Keep Git Graph semantics: only advance `i` when the vertex is "done".
    while (i < this.vertices.length && this.iterations < this.maxIterations) {
      const current = this.vertices[i];
      if (current.getNextParent() !== null || current.isNotOnBranch()) {
        this.determinePath(i);
      } else {
        i++;
      }
      this.iterations++;
    }
    this.completed = i >= this.vertices.length;
    return this.completed;
  }

  public getVertices() {
    return this.vertices;
  }

  public isComplete() {
    return this.completed;
  }

  public getIterations() {
    return this.iterations;
  }

  private determinePath(startAt: number) {
    let vertex = this.vertices[startAt];
    let parentVertex = vertex.getNextParent();
    let lastPoint = vertex.isNotOnBranch() ? vertex.getNextPoint() : vertex.getPoint();

    if (
      parentVertex !== null &&
      parentVertex.id !== NULL_VERTEX_ID &&
      vertex.isMerge() &&
      !vertex.isNotOnBranch() &&
      !parentVertex.isNotOnBranch()
    ) {
      const parentBranch = parentVertex.getBranch()!;
      let foundConnection = false;
      for (let i = startAt + 1; i < this.vertices.length; i++) {
        const current = this.vertices[i];
        let point = current.getPointConnectingTo(parentVertex, parentBranch);
        if (point !== null) {
          foundConnection = true;
        } else {
          point = current.getNextPoint();
        }
        parentBranch.addLine(lastPoint, point, !foundConnection && current !== parentVertex ? lastPoint.x < point.x : true);
        current.registerUnavailablePoint(point.x, parentVertex, parentBranch);
        lastPoint = point;
        if (foundConnection) {
          vertex.registerParentProcessed();
          break;
        }
      }
      if (!foundConnection) {
        vertex.registerParentProcessed();
      }
    } else {
      const branch = new Branch(this.getAvailableColour(startAt));
      vertex.addToBranch(branch, lastPoint.x);
      vertex.registerUnavailablePoint(lastPoint.x, vertex, branch);
      let endIndex = this.vertices.length;
      for (let i = startAt + 1; i < this.vertices.length; i++) {
        const current = this.vertices[i];
        const point =
          parentVertex === current && parentVertex !== null && !parentVertex.isNotOnBranch()
            ? current.getPoint()
            : current.getNextPoint();
        current.registerUnavailablePoint(point.x, parentVertex, branch);
        lastPoint = point;
        if (parentVertex === current) {
          vertex.registerParentProcessed();
          const parentOnBranch = !parentVertex!.isNotOnBranch();
          parentVertex!.addToBranch(branch, point.x);
          vertex = parentVertex!;
          parentVertex = vertex.getNextParent();
          if (parentVertex === null || parentOnBranch) {
            endIndex = i;
            break;
          }
        }
      }
      branch.setEnd(endIndex);
      this.branches.push(branch);
      this.availableColours[branch.getColour()] = Math.max(this.availableColours[branch.getColour()] ?? 0, endIndex);
    }
  }

  private getAvailableColour(startAt: number) {
    for (let i = 0; i < this.availableColours.length; i++) {
      if (startAt > this.availableColours[i]) {
        return i;
      }
    }
    this.availableColours.push(0);
    return this.availableColours.length - 1;
  }
}

export function buildGraphNodes(
  branchHistories: Record<string, NodeRecord[]>,
  activeBranchName: string,
  trunkName: string
): GraphNode[] {
  const nodeById = new Map<string, NodeRecord>();
  const firstSeenBranchById = new Map<string, string>();
  const activeNodeIds = new Set<string>();

  for (const [branchName, nodes] of Object.entries(branchHistories)) {
    for (const node of nodes) {
      if (!nodeById.has(node.id)) {
        nodeById.set(node.id, node);
        firstSeenBranchById.set(node.id, branchName);
      }
      if (branchName === activeBranchName) {
        activeNodeIds.add(node.id);
      }
    }
  }

  const graphNodes = Array.from(nodeById.values()).map((node) => {
    const parents: string[] = [];
    if (node.parent) parents.push(node.parent);
    if (node.type === 'merge') {
      // `sourceNodeIds` contains all source-branch nodes not on target; the merge "parent" we want
      // for graph layout is the source branch head at merge time (the newest unique node).
      const mergeParent = node.sourceNodeIds[node.sourceNodeIds.length - 1];
      if (mergeParent) parents.push(mergeParent);
    }
    const inferredBranch = firstSeenBranchById.get(node.id) ?? trunkName;
    const originBranchId = node.createdOnBranch ?? inferredBranch;
    return {
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
    };
  });

  // Topologically order oldest-first so time runs downward.
  const parentsById = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const childrenByParent = new Map<string, string[]>();

  for (const node of graphNodes) {
    parentsById.set(node.id, node.parents);
    indegree.set(node.id, 0);
  }

  for (const node of graphNodes) {
    for (const parentId of node.parents) {
      if (!indegree.has(parentId)) continue;
      indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
      const children = childrenByParent.get(parentId) ?? [];
      children.push(node.id);
      childrenByParent.set(parentId, children);
    }
  }

  const timestampById = new Map<string, number>();
  for (const node of graphNodes) {
    timestampById.set(node.id, nodeById.get(node.id)?.timestamp ?? 0);
  }

  const ready: string[] = [];
  for (const [id, deg] of indegree.entries()) {
    if (deg === 0) ready.push(id);
  }

  const compareReady = (a: string, b: string) => {
    const ta = timestampById.get(a) ?? 0;
    const tb = timestampById.get(b) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.localeCompare(b);
  };
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

  if (ordered.length !== graphNodes.length) {
    const remaining = graphNodes
      .map((n) => n.id)
      .filter((id) => !ordered.includes(id))
      .sort(compareReady);
    ordered.push(...remaining);
  }

  const byId = new Map(graphNodes.map((n) => [n.id, n]));
  return ordered.map((id) => byId.get(id)!).filter(Boolean);
}

function buildCollapsedGraphNodes(
  branchHistories: Record<string, NodeRecord[]>,
  activeBranchName: string,
  trunkName: string
): GraphNode[] {
  const nodeById = new Map<string, NodeRecord>();
  const firstSeenBranchById = new Map<string, string>();
  const activeNodeIds = new Set<string>();
  const mergeNodeIds = new Set<string>();

  for (const [branchName, nodes] of Object.entries(branchHistories)) {
    for (const node of nodes) {
      if (!nodeById.has(node.id)) {
        nodeById.set(node.id, node);
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

  const important = new Set<string>();
  for (const [branchName, nodes] of Object.entries(branchHistories)) {
    const tip = nodes[nodes.length - 1];
    if (tip) important.add(tip.id);
    if (branchName === trunkName) continue;
    const max = Math.min(nodes.length, trunkHistory.length);
    let idx = 0;
    while (idx < max && nodes[idx]?.id === trunkHistory[idx]?.id) idx += 1;
    const forkBase = idx > 0 ? trunkHistory[idx - 1] : null;
    const firstUnique = idx < nodes.length ? nodes[idx] : null;
    if (forkBase) important.add(forkBase.id);
    if (firstUnique) important.add(firstUnique.id);
  }
  for (const id of mergeNodeIds) important.add(id);

  // Add trunk root if present, to anchor the timeline.
  if (trunkIds.length > 0) {
    important.add(trunkIds[0]);
  }

  // Map parent references to the nearest included ancestor (so edges can "jump" over hidden nodes).
  const primaryParentById = new Map<string, string | null>();
  const mergeParentsById = new Map<string, string[]>();
  for (const [id, node] of nodeById.entries()) {
    primaryParentById.set(id, node.parent);
    if (node.type === 'merge') {
      const mergeParent = node.sourceNodeIds[node.sourceNodeIds.length - 1];
      mergeParentsById.set(id, mergeParent ? [mergeParent] : []);
    } else {
      mergeParentsById.set(id, []);
    }
  }

  const resolveIncludedAncestor = (startId: string | null): string | null => {
    let current: string | null = startId;
    const seen = new Set<string>();
    while (current) {
      if (important.has(current)) return current;
      if (seen.has(current)) return null;
      seen.add(current);
      current = primaryParentById.get(current) ?? null;
    }
    return null;
  };

  const collapsedNodes: GraphNode[] = [];
  for (const id of important) {
    const node = nodeById.get(id);
    if (!node) continue;
    const inferredBranch = firstSeenBranchById.get(id) ?? trunkName;
    const originBranchId = node.createdOnBranch ?? inferredBranch;

    const parents: string[] = [];
    const primary = resolveIncludedAncestor(node.parent);
    if (primary) parents.push(primary);
    const mergeParents = mergeParentsById.get(id) ?? [];
    for (const mergeParentId of mergeParents) {
      const resolved = resolveIncludedAncestor(mergeParentId);
      if (resolved && !parents.includes(resolved)) parents.push(resolved);
    }

    collapsedNodes.push({
      id,
      parents,
      originBranchId,
      laneBranchId: inferredBranch,
      isOnActiveBranch: activeNodeIds.has(id),
      label: node.type === 'merge' ? `Merge · ${node.mergeFrom}` : inferredBranch,
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

function buildStarredGraphNodes(
  branchHistories: Record<string, NodeRecord[]>,
  activeBranchName: string,
  trunkName: string,
  starredNodeIds: string[]
): GraphNode[] {
  const nodeById = new Map<string, NodeRecord>();
  const firstSeenBranchById = new Map<string, string>();
  const activeNodeIds = new Set<string>();

  for (const [branchName, nodes] of Object.entries(branchHistories)) {
    for (const node of nodes) {
      if (!nodeById.has(node.id)) {
        nodeById.set(node.id, node);
        firstSeenBranchById.set(node.id, branchName);
      }
      if (branchName === activeBranchName) {
        activeNodeIds.add(node.id);
      }
    }
  }

  const trunkHistory = branchHistories[trunkName] ?? [];
  const trunkRootId = trunkHistory[0]?.id ?? null;

  const important = new Set<string>();
  for (const id of starredNodeIds) {
    if (nodeById.has(id)) important.add(id);
  }
  if (trunkRootId) important.add(trunkRootId);

  const primaryParentById = new Map<string, string | null>();
  const mergeParentsById = new Map<string, string[]>();
  for (const [id, node] of nodeById.entries()) {
    primaryParentById.set(id, node.parent);
    if (node.type === 'merge') {
      const mergeParent = node.sourceNodeIds[node.sourceNodeIds.length - 1];
      mergeParentsById.set(id, mergeParent ? [mergeParent] : []);
    } else {
      mergeParentsById.set(id, []);
    }
  }

  const resolveIncludedAncestor = (startId: string | null): string | null => {
    let current: string | null = startId;
    const seen = new Set<string>();
    while (current) {
      if (important.has(current)) return current;
      if (seen.has(current)) return null;
      seen.add(current);
      current = primaryParentById.get(current) ?? null;
    }
    return null;
  };

  const nodes: GraphNode[] = [];
  for (const id of important) {
    const node = nodeById.get(id);
    if (!node) continue;
    const inferredBranch = firstSeenBranchById.get(id) ?? trunkName;
    const originBranchId = node.createdOnBranch ?? inferredBranch;

    const parents: string[] = [];
    const primary = resolveIncludedAncestor(node.parent);
    if (primary) parents.push(primary);
    const mergeParents = mergeParentsById.get(id) ?? [];
    for (const mergeParentId of mergeParents) {
      const resolved = resolveIncludedAncestor(mergeParentId);
      if (resolved && !parents.includes(resolved)) parents.push(resolved);
    }

    nodes.push({
      id,
      parents,
      originBranchId,
      laneBranchId: inferredBranch,
      isOnActiveBranch: activeNodeIds.has(id),
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

  nodes.sort((a, b) => {
    const ta = nodeById.get(a.id)?.timestamp ?? 0;
    const tb = nodeById.get(b.id)?.timestamp ?? 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  return nodes;
}

interface LayoutResult {
  nodes: Node<DotNodeData>[];
  edges: Edge<GitEdgeData>[];
  usedFallback: boolean;
}

interface LayoutOptions {
  maxIterations?: number;
}

function buildSimpleLayout(graphNodes: GraphNode[], branchName: string, trunkName: string): LayoutResult {
  const laneByBranch = new Map<string, number>([
    [trunkName, 0],
    [branchName, 1]
  ]);
  let nextLane = 2;
  const laneFor = (branchId: string) => {
    if (!laneByBranch.has(branchId)) {
      laneByBranch.set(branchId, nextLane++);
    }
    return laneByBranch.get(branchId)!;
  };

  const idToIndex = new Map(graphNodes.map((node, idx) => [node.id, idx]));

  const lanes = graphNodes.map((node) => laneFor(node.laneBranchId));
  const maxLane = lanes.reduce((max, lane) => Math.max(max, lane), 0);

  const nodes: Node<DotNodeData>[] = graphNodes.map((node, index) => {
    const lane = lanes[index];
    const x = lane * laneSpacing;
    const y = index * rowSpacing;
    const color = getBranchColor(node.originBranchId, trunkName);
    return {
      id: node.id,
      type: 'dot',
      position: { x, y },
      data: {
        label: node.label,
        color,
        isActive: node.isOnActiveBranch,
        icon: node.icon,
        labelTranslateX: Math.max(
          0,
          lane === maxLane ? 0 : (maxLane - lane) * laneSpacing + LABEL_ROW_GAP - LABEL_BASE_OFFSET
        )
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    };
  });

  const edges: Edge<GitEdgeData>[] = [];
  graphNodes.forEach((node) => {
    const targetIndex = idToIndex.get(node.id);
    if (typeof targetIndex !== 'number') return;
    const targetLane = laneFor(node.laneBranchId);
    node.parents.forEach((parentId) => {
      const parentIndex = idToIndex.get(parentId);
      if (typeof parentIndex !== 'number') return;
      const parentLane = laneFor(graphNodes[parentIndex].laneBranchId);
      const sameLane = parentLane === targetLane;
      const color = getBranchColor(graphNodes[parentIndex].originBranchId, trunkName);
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'git',
        data: {
          color,
          style: sameLane ? 'angular' : 'curve',
          lockedFirst: !sameLane
        }
      });
    });
  });

  return { nodes, edges, usedFallback: true };
}

export function layoutGraph(
  graphNodes: GraphNode[],
  branchName: string,
  trunkName: string,
  options?: LayoutOptions
): LayoutResult {
  if (graphNodes.length === 0) {
    return { nodes: [], edges: [], usedFallback: false };
  }
  const simple = buildSimpleLayout(graphNodes, branchName, trunkName);

  const graphNodesOldestFirst = graphNodes;
  const idToOldIndex = new Map(graphNodesOldestFirst.map((node, idx) => [node.id, idx]));

  // Layout runs on a reversed view only, to keep Git Graph assumptions intact (newest-first, parents older).
  const graphNodesNewestFirst = graphNodesOldestFirst
    .map((node) => ({
      ...node,
      parents: [...node.parents]
    }))
    .reverse();
  const idToNewIndex = new Map(graphNodesNewestFirst.map((node, idx) => [node.id, idx]));

  // Sanity check: in newest-first order, parents should be at a higher index than children.
  for (let childNew = 0; childNew < graphNodesNewestFirst.length; childNew++) {
    const node = graphNodesNewestFirst[childNew];
    for (const parentId of node.parents) {
      const parentNew = idToNewIndex.get(parentId);
      if (typeof parentNew === 'number' && parentNew <= childNew) {
        console.warn('[WorkspaceGraph] Parent ordering violation', { nodeId: node.id, parentId, childNew, parentNew });
      }
    }
  }

  const maxIterations = options?.maxIterations ?? graphNodes.length * 8 + 16;
  const layout = new GitGraphLayout(graphNodesNewestFirst, maxIterations);
  let ok = false;
  try {
    ok = layout.compute();
  } catch (err) {
    console.warn('[WorkspaceGraph] GitGraphLayout threw; using lane-per-branch fallback.', err);
    ok = false;
  }
  if (!ok) {
    console.warn(
      `[WorkspaceGraph] GitGraphLayout did not complete within ${maxIterations} iterations for ${graphNodes.length} nodes. Using lane-per-branch fallback.`
    );
    return simple;
  }

  const vertices = layout.getVertices();
  const totalRows = vertices.length;

  const flowNodes: Node<DotNodeData>[] = graphNodesOldestFirst.map((node, oldIndex) => {
    const newIndex = totalRows - 1 - oldIndex;
    const lane = vertices[newIndex].getLane();
    const rightMostAtRow = vertices[newIndex].getMaxReservedX();
    const x = lane * laneSpacing;
    const y = oldIndex * rowSpacing;
    const color = getBranchColor(node.originBranchId, trunkName);
    const labelTranslateX =
      lane === rightMostAtRow ? 0 : (rightMostAtRow - lane) * laneSpacing + LABEL_ROW_GAP - LABEL_BASE_OFFSET;
    return {
      id: node.id,
      type: 'dot',
      position: { x, y },
      data: {
        label: node.label,
        color,
        isActive: node.isOnActiveBranch,
        icon: node.icon,
        labelTranslateX: Math.max(0, labelTranslateX)
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    };
  });

  const flowEdges: Edge<GitEdgeData>[] = [];
  graphNodesOldestFirst.forEach((node) => {
    const childOld = idToOldIndex.get(node.id);
    if (typeof childOld !== 'number') return;
    const childNew = totalRows - 1 - childOld;
    const childLane = vertices[childNew].getLane();
    node.parents.forEach((parentId) => {
      const parentOld = idToOldIndex.get(parentId);
      if (typeof parentOld !== 'number') return;
      const parentNew = totalRows - 1 - parentOld;
      const parentLane = vertices[parentNew].getLane();
      const sameLane = parentLane === childLane;
      const color = getBranchColor(graphNodesOldestFirst[parentOld].originBranchId, trunkName);
      flowEdges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'git',
        data: {
          color,
          style: sameLane ? 'angular' : 'curve',
          lockedFirst: parentLane < childLane
        }
      });
    });
  });

  return { nodes: flowNodes, edges: flowEdges, usedFallback: false };
}


export function WorkspaceGraph({
  branchHistories,
  activeBranchName,
  trunkName,
  mode = 'nodes',
  starredNodeIds = [],
  onModeChange
}: WorkspaceGraphProps) {
  const graphNodes = useMemo(
    () =>
      mode === 'starred'
        ? buildStarredGraphNodes(branchHistories, activeBranchName, trunkName, starredNodeIds)
        : mode === 'collapsed'
        ? buildCollapsedGraphNodes(branchHistories, activeBranchName, trunkName)
        : buildGraphNodes(branchHistories, activeBranchName, trunkName),
    [branchHistories, activeBranchName, trunkName, mode, starredNodeIds]
  );

  const { nodes, edges } = useMemo(
    () => layoutGraph(graphNodes, activeBranchName, trunkName),
    [graphNodes, activeBranchName, trunkName]
  );

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const viewportByModeRef = useRef<Record<string, Viewport>>({});
  const followBottomByModeRef = useRef<Record<string, boolean>>({});

  const contentBounds = useMemo(() => {
    if (nodes.length === 0) return { minY: 0, maxY: 0, height: 0 };
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of nodes) {
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y);
    }
    return { minY, maxY, height: maxY - minY + rowSpacing };
  }, [nodes]);

  const shouldPanOnScroll = viewportHeight > 0 && contentBounds.height > viewportHeight + 8;

  const translateExtent = useMemo(() => {
    if (nodes.length === 0) return undefined;
    // Clamp vertical panning to content, but allow generous horizontal room so labels don't feel cropped.
    return [
      [-100000, contentBounds.minY - rowSpacing * 2],
      [100000, contentBounds.maxY + rowSpacing * 2]
    ] as [[number, number], [number, number]];
  }, [nodes.length, contentBounds.minY, contentBounds.maxY]);

  const computeBottomViewport = () => {
    return {
      x: DEFAULT_VIEWPORT.x,
      y: viewportHeight - BOTTOM_VIEWPORT_PADDING - contentBounds.maxY,
      zoom: 1
    } satisfies Viewport;
  };

  useEffect(() => {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const instance = flowInstance;
    if (!instance) return;
    if (viewportHeight <= 0) return;
    // If the view isn't scrollable, always reset to a sensible default so toggling
    // from a scrolled mode doesn't leave the graph "above" the visible area.
    if (!shouldPanOnScroll) {
      instance.setViewport(DEFAULT_VIEWPORT, { duration: 0 });
      followBottomByModeRef.current[mode] = false;
      return;
    }
    const saved = viewportByModeRef.current[mode];
    if (saved) {
      const next = { ...saved, zoom: 1 };
      if (next.x > 0 && next.x < DEFAULT_VIEWPORT.x) next.x = DEFAULT_VIEWPORT.x;
      if (next.y > 0 && next.y < DEFAULT_VIEWPORT.y) next.y = DEFAULT_VIEWPORT.y;
      instance.setViewport(next, { duration: 0 });
    } else {
      const next = computeBottomViewport();
      instance.setViewport(next, { duration: 0 });
      viewportByModeRef.current[mode] = next;
      followBottomByModeRef.current[mode] = true;
    }
  }, [flowInstance, mode, shouldPanOnScroll, nodes.length, viewportHeight]);

  useEffect(() => {
    const instance = flowInstance;
    if (!instance) return;
    if (viewportHeight <= 0) return;
    if (!shouldPanOnScroll) return;
    if (!followBottomByModeRef.current[mode]) return;
    const next = computeBottomViewport();
    instance.setViewport(next, { duration: 0 });
    viewportByModeRef.current[mode] = next;
  }, [flowInstance, mode, shouldPanOnScroll, nodes.length, viewportHeight]);

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <InsightFrame className="flex-1 min-h-0" innerClassName="relative">
        <div ref={viewportRef} className="h-full min-h-0">
          {onModeChange ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10 flex justify-end">
              <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-slate-100/80 p-1 text-[11px] font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                <button
                  type="button"
                  onClick={() => onModeChange('collapsed')}
                  className={`rounded-full px-3 py-1 transition ${
                    mode === 'collapsed' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Collapsed
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('nodes')}
                  className={`rounded-full px-3 py-1 transition ${
                    mode === 'nodes' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('starred')}
                  className={`rounded-full px-3 py-1 transition ${
                    mode === 'starred' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Starred
                </button>
              </div>
            </div>
          ) : null}

          {mode === 'starred' && starredNodeIds.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">Star nodes to pin them here.</div>
          ) : nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No graph yet — start chatting to visualize history.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              defaultViewport={DEFAULT_VIEWPORT}
              onInit={(instance) => {
                setFlowInstance(instance);
              }}
              onMoveEnd={(_event, viewport) => {
                viewportByModeRef.current[mode] = { ...viewport, zoom: 1 };
                if (!shouldPanOnScroll) {
                  followBottomByModeRef.current[mode] = false;
                  return;
                }
                const bottom = computeBottomViewport();
                followBottomByModeRef.current[mode] = Math.abs(viewport.y - bottom.y) < 24;
              }}
              panOnScroll={shouldPanOnScroll}
              panOnScrollMode="vertical"
              panOnDrag={false}
              translateExtent={translateExtent}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              minZoom={1}
              maxZoom={1}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} size={1} color="#e2e8f0" />
            </ReactFlow>
          )}
        </div>
      </InsightFrame>
    </div>
  );
}

function formatLabel(node: NodeRecord) {
  if (node.type === 'merge') {
    return node.mergeSummary ? `Merge · ${node.mergeSummary}` : `Merge from ${node.mergeFrom}`;
  }
  if (node.type === 'state') {
    return 'Canvas snapshot';
  }
  if (node.type === 'message') {
    return `${node.content.slice(0, 42)}${node.content.length > 42 ? '…' : ''}`;
  }
  return node.id;
}
