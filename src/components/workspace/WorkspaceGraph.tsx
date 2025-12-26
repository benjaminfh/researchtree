'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  type Edge,
  type EdgeProps,
  EdgeLabelRenderer,
  Handle,
  PanOnScrollMode,
  type ReactFlowInstance,
  type Viewport,
  type Node,
  type NodeProps,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { NodeRecord } from '@git/types';
import { deriveTextFromBlocks, getContentBlocksWithLegacyFallback } from '@/src/shared/thinkingTraces';
import { features } from '@/src/config/features';
import { getBranchColor } from './branchColors';
import { InsightFrame } from './InsightFrame';
import { ArrowLeftCircleIcon, CpuChipIcon, UserIcon } from './HeroIcons';

interface WorkspaceGraphProps {
  branchHistories: Record<string, NodeRecord[]>;
  activeBranchName: string;
  trunkName: string;
  branchColors?: Record<string, string>;
  mode?: 'nodes' | 'collapsed' | 'starred';
  starredNodeIds?: string[];
  onModeChange?: (mode: 'nodes' | 'collapsed' | 'starred') => void;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
}

interface DotNodeData {
  label: string;
  color: string;
  isActive: boolean;
  icon?: 'assistant' | 'user' | 'merge';
  labelTranslateX: number;
  isSelected?: boolean;
  isActiveHead?: boolean;
}

interface GitEdgeData {
  color: string;
  style: 'angular' | 'curve';
  lockedFirst: boolean;
  strokeWidth?: number;
  hiddenCount?: number;
}

const rowSpacing = 45;
const laneSpacing = 18;
const NULL_VERTEX_ID = -1;
const DEFAULT_VIEWPORT = { x: 48, y: 88, zoom: 1 } as const;
const BOTTOM_VIEWPORT_PADDING = 56;
const CENTER_VIEWPORT_THRESHOLD = 0.75;
const LABEL_BASE_OFFSET = 24; // icon (16) + gap (8)
const LABEL_ROW_GAP = 20; // gap after the right-most line when the node isn't on it
const EDGE_ANGULAR_BEND = 0.32;
const EDGE_CURVE_BEND = 0.7;
const EDGE_STYLE = features.graphEdgeStyle;

const DotNode = ({ data }: NodeProps<DotNodeData>) => (
  <div className="relative flex items-center gap-2">
    <Handle
      type="target"
      position={Position.Top}
      className="!h-2 !w-2 !border-0 !bg-transparent"
      style={{ left: 8, top: -2, opacity: 0 }}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      className="!h-2 !w-2 !border-0 !bg-transparent"
      style={{ left: 8, bottom: -2, opacity: 0 }}
    />
    <span
      className={`relative z-10 inline-flex rounded-full ${data.isSelected ? 'ring-2 ring-primary/40 ring-offset-2' : ''}`}
      style={{ transform: 'translateX(-2px)' }}
    >
      {data.icon === 'assistant' ? (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white"
          style={{
            color: data.color,
            filter: data.isActive ? `drop-shadow(0 0 0 ${data.color}66)` : 'none'
          }}
        >
          <CpuChipIcon className="h-4 w-4" />
        </span>
      ) : data.icon === 'user' ? (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white"
          style={{
            color: data.color,
            filter: data.isActive ? `drop-shadow(0 0 0 ${data.color}66)` : 'none'
          }}
        >
          <UserIcon className="h-4 w-4" />
        </span>
      ) : data.icon === 'merge' ? (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full"
          style={{
            backgroundColor: data.color,
            filter: data.isActive ? `drop-shadow(0 0 0 ${data.color}66)` : 'none'
          }}
        >
          <ArrowLeftCircleIcon className="h-[11px] w-[11px] transform -scale-y-100 text-white" />
        </span>
      ) : (
        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: data.color }} />
      )}
    </span>
    <span
      className="flex max-w-[360px] items-center gap-2 whitespace-nowrap text-sm font-medium text-slate-800"
      style={{ transform: `translateX(${data.labelTranslateX}px)` }}
    >
      <span className="truncate">{data.label}</span>
      {data.isActiveHead ? (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/20">
          Current
        </span>
      ) : null}
    </span>
  </div>
);

const GitEdge = ({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<GitEdgeData>) => {
  const path =
    EDGE_STYLE === 'orthogonal'
      ? buildOrthogonalRoundedPath(sourceX, sourceY, targetX, targetY, laneSpacing / 2.5)
      : data?.style === 'curve'
      ? buildCurvePath(sourceX, sourceY, targetX, targetY)
      : buildAngularPath(sourceX, sourceY, targetX, targetY, data?.lockedFirst);
  const hiddenCount = data?.hiddenCount ?? 0;
  const strokeWidth = data?.strokeWidth ?? 2;
  const dotSize = strokeWidth * 4;
  const edgeAngle = (Math.atan2(targetY - sourceY, targetX - sourceX) * 180) / Math.PI;
  let labelX = (sourceX + targetX) / 2;
  let labelY = (sourceY + targetY) / 2;
  let labelAngle = edgeAngle;
  if (EDGE_STYLE === 'orthogonal') {
    if (sourceX === targetX || sourceY === targetY) {
      labelAngle = sourceX === targetX ? 90 : 0;
    } else {
      const bendY = getOrthogonalBendY(sourceY, targetY);
      const seg1 = Math.abs(bendY - sourceY);
      const seg2 = Math.abs(targetX - sourceX);
      const seg3 = Math.abs(targetY - bendY);
      const total = seg1 + seg2 + seg3;
      const half = total / 2;
      if (half <= seg1) {
        labelX = sourceX;
        labelY = sourceY + Math.sign(bendY - sourceY) * half;
        labelAngle = 90;
      } else if (half <= seg1 + seg2) {
        labelX = sourceX + Math.sign(targetX - sourceX) * (half - seg1);
        labelY = bendY;
        labelAngle = 0;
      } else {
        labelX = targetX;
        labelY = bendY + Math.sign(targetY - bendY) * (half - seg1 - seg2);
        labelAngle = 90;
      }
    }
  }
  return (
    <>
      <path
        d={path}
        className="react-flow__edge-path"
        style={{
          fill: 'none',
          stroke: data?.color ?? '#94a3b8',
          strokeWidth,
          strokeLinecap: 'round'
        }}
      />
      {hiddenCount > 0 ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-auto z-10"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px) rotate(${labelAngle}deg)`
            }}
          >
            <div className="group relative flex items-center">
              <span
                className="rounded-full"
                style={{ width: dotSize, height: dotSize, backgroundColor: data?.color ?? '#94a3b8', opacity: 0.6 }}
              />
              <span
                className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-md ring-1 transition-opacity group-hover:opacity-100"
                style={{
                  transform: `translate(-80%, -25%) rotate(${-labelAngle}deg)`,
                  boxShadow: `0 0 0 1px ${data?.color ?? '#94a3b8'}`
                }}
              >
                {hiddenCount} hidden nodes
              </span>
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};

const nodeTypes = { dot: DotNode };
const edgeTypes = { git: GitEdge };

function buildAngularPath(sx: number, sy: number, tx: number, ty: number, lockedFirst?: boolean) {
  if (sx === tx) {
    return `M ${sx},${sy} L ${tx},${ty}`;
  }
  const d = Math.abs(ty - sy) * EDGE_ANGULAR_BEND;
  if (lockedFirst) {
    return `M ${sx},${sy} L ${tx},${ty - d} L ${tx},${ty}`;
  }
  return `M ${sx},${sy} L ${sx},${sy + d} L ${tx},${ty}`;
}

function getOrthogonalBendY(sy: number, ty: number) {
  const dy = ty - sy;
  const bend = sy + dy * EDGE_ANGULAR_BEND;
  if (Math.abs(bend - sy) < 1 || Math.abs(ty - bend) < 1) {
    return sy + dy / 2;
  }
  return bend;
}

function buildOrthogonalRoundedPath(sx: number, sy: number, tx: number, ty: number, radius: number) {
  if (sx === tx || sy === ty) {
    return `M ${sx},${sy} L ${tx},${ty}`;
  }

  const bendY = getOrthogonalBendY(sy, ty);
  const dx = tx - sx;
  const dy1 = bendY - sy;
  const dy2 = ty - bendY;
  const signX = Math.sign(dx) || 1;
  const signY1 = Math.sign(dy1) || 1;
  const signY2 = Math.sign(dy2) || 1;
  const r = Math.min(radius, Math.abs(dy1), Math.abs(dx), Math.abs(dy2));
  if (r < 0.5) {
    return `M ${sx},${sy} L ${sx},${bendY} L ${tx},${bendY} L ${tx},${ty}`;
  }

  const sweep1 = signX === signY1 ? 0 : 1;
  const sweep2 = signX === signY2 ? 1 : 0;

  const p1y = bendY - signY1 * r;
  const p2x = sx + signX * r;
  const p3x = tx - signX * r;
  const p4y = bendY + signY2 * r;

  return [
    `M ${sx},${sy}`,
    `L ${sx},${p1y}`,
    `A ${r} ${r} 0 0 ${sweep1} ${p2x} ${bendY}`,
    `L ${p3x} ${bendY}`,
    `A ${r} ${r} 0 0 ${sweep2} ${tx} ${p4y}`,
    `L ${tx},${ty}`
  ].join(' ');
}

function buildCurvePath(sx: number, sy: number, tx: number, ty: number) {
  const d = Math.abs(ty - sy) * EDGE_CURVE_BEND;
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
  hiddenCountByParent?: Record<string, number>;
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

  const orderedBranchEntries = Object.entries(branchHistories).sort(([a], [b]) => {
    if (a === trunkName && b !== trunkName) return -1;
    if (a !== trunkName && b === trunkName) return 1;
    return a.localeCompare(b);
  });

  for (const [branchName, nodes] of orderedBranchEntries) {
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

  const graphNodes: GraphNode[] = Array.from(nodeById.values()).map((node): GraphNode => {
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

  const orderedBranchEntries = Object.entries(branchHistories).sort(([a], [b]) => {
    if (a === trunkName && b !== trunkName) return -1;
    if (a !== trunkName && b === trunkName) return 1;
    return a.localeCompare(b);
  });

  for (const [branchName, nodes] of orderedBranchEntries) {
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
  const activeHeadId = branchHistories[activeBranchName]?.[branchHistories[activeBranchName].length - 1]?.id ?? null;

  const important = new Set<string>();
  for (const [branchName, nodes] of orderedBranchEntries) {
    const createdOnBranch = nodes.filter((node) => node.createdOnBranch === branchName);
    if (createdOnBranch.length >= 2) {
      important.add(createdOnBranch[0].id);
      important.add(createdOnBranch[createdOnBranch.length - 1].id);
    } else if (createdOnBranch.length === 1) {
      important.add(createdOnBranch[0].id);
    }
    if (branchName === trunkName) continue;
    const max = Math.min(nodes.length, trunkHistory.length);
    let idx = 0;
    while (idx < max && nodes[idx]?.id === trunkHistory[idx]?.id) idx += 1;
    const forkBase = idx > 0 ? trunkHistory[idx - 1] : null;
    if (forkBase) important.add(forkBase.id);
  }
  for (const id of mergeNodeIds) important.add(id);

  // Add trunk root if present, to anchor the timeline.
  if (trunkIds.length > 0) {
    important.add(trunkIds[0]);
  }
  if (activeHeadId) {
    important.add(activeHeadId);
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

  const resolveIncludedAncestor = (startId: string | null): { id: string | null; hiddenCount: number } => {
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

function buildStarredGraphNodes(
  branchHistories: Record<string, NodeRecord[]>,
  activeBranchName: string,
  trunkName: string,
  starredNodeIds: string[]
): GraphNode[] {
  const nodeById = new Map<string, NodeRecord>();
  const firstSeenBranchById = new Map<string, string>();
  const activeNodeIds = new Set<string>();

  const orderedBranchEntries = Object.entries(branchHistories).sort(([a], [b]) => {
    if (a === trunkName && b !== trunkName) return -1;
    if (a !== trunkName && b === trunkName) return 1;
    return a.localeCompare(b);
  });

  for (const [branchName, nodes] of orderedBranchEntries) {
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
  const activeHeadId = branchHistories[activeBranchName]?.[branchHistories[activeBranchName].length - 1]?.id ?? null;

  const important = new Set<string>();
  for (const id of starredNodeIds) {
    if (nodeById.has(id)) important.add(id);
  }
  if (trunkRootId) important.add(trunkRootId);
  if (activeHeadId && nodeById.has(activeHeadId)) important.add(activeHeadId);

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

function buildSimpleLayout(
  graphNodes: GraphNode[],
  branchName: string,
  trunkName: string,
  branchColors?: Record<string, string>
): LayoutResult {
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
    const color = getBranchColor(node.originBranchId, trunkName, branchColors);
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
      const color = getBranchColor(graphNodes[parentIndex].originBranchId, trunkName, branchColors);
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'git',
        data: {
          color,
          style: sameLane ? 'angular' : 'curve',
          lockedFirst: !sameLane,
          hiddenCount: node.hiddenCountByParent?.[parentId]
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
  branchColors?: Record<string, string>,
  options?: LayoutOptions
): LayoutResult {
  if (graphNodes.length === 0) {
    return { nodes: [], edges: [], usedFallback: false };
  }
  const simple = buildSimpleLayout(graphNodes, branchName, trunkName, branchColors);

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
    const x = lane * laneSpacing - 20;
    const y = oldIndex * rowSpacing;
    const color = getBranchColor(node.originBranchId, trunkName, branchColors);
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
      const color = getBranchColor(graphNodesOldestFirst[parentOld].originBranchId, trunkName, branchColors);
      flowEdges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'git',
        data: {
          color,
          style: sameLane ? 'angular' : 'curve',
          lockedFirst: parentLane < childLane,
          hiddenCount: node.hiddenCountByParent?.[parentId]
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
  branchColors,
  mode = 'nodes',
  starredNodeIds = [],
  onModeChange,
  selectedNodeId,
  onSelectNode
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
    () => layoutGraph(graphNodes, activeBranchName, trunkName, branchColors),
    [graphNodes, activeBranchName, trunkName, branchColors]
  );

  const activeHeadId = useMemo(() => {
    const activeHistory = branchHistories[activeBranchName] ?? [];
    return activeHistory[activeHistory.length - 1]?.id ?? null;
  }, [branchHistories, activeBranchName]);

  const decoratedEdges = useMemo(() => {
    if (edges.length === 0) return edges;

    const byId = new Map(graphNodes.map((node) => [node.id, node]));

    const flowEdgeIds = new Set<string>();
    let cursor = activeHeadId;
    while (cursor) {
      const node = byId.get(cursor);
      if (!node) break;
      const primaryParentId = node.parents[0];
      if (!primaryParentId) break;
      flowEdgeIds.add(`${primaryParentId}-${cursor}`);
      cursor = primaryParentId;
    }

    const edgeColorFor = (parentId: string, childId: string) => {
      const child = byId.get(childId);
      const childColor = getBranchColor(child?.originBranchId ?? trunkName, trunkName, branchColors);
      return childColor;
    };

    return edges.map((edge) => {
      const isFlow = flowEdgeIds.has(edge.id);
      const color = edgeColorFor(edge.source, edge.target);
      return {
        ...edge,
        data: {
          ...edge.data,
          color,
          strokeWidth: isFlow ? 3 : 2
        }
      };
    });
  }, [edges, graphNodes, activeHeadId, trunkName]);

  const decoratedNodes = useMemo(() => {
    return nodes.map((node) => {
      const isActiveHead = !!activeHeadId && node.id === activeHeadId;
      return {
        ...node,
        data: {
          ...node.data,
          isSelected: !!selectedNodeId && node.id === selectedNodeId,
          isActiveHead
        }
      };
    });
  }, [nodes, selectedNodeId, activeHeadId]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const viewportByModeRef = useRef<Record<string, Viewport>>({});
  const followBottomByModeRef = useRef<Record<string, boolean>>({});
  const prevNodeCountRef = useRef<number | null>(null);

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
      [-100000, contentBounds.minY - DEFAULT_VIEWPORT.y],
      [100000, contentBounds.maxY + BOTTOM_VIEWPORT_PADDING]
    ] as [[number, number], [number, number]];
  }, [nodes.length, contentBounds.minY, contentBounds.maxY]);

  const viewportYBounds = useMemo(() => {
    if (viewportHeight <= 0 || nodes.length === 0) return null;
    if (contentBounds.height < viewportHeight * CENTER_VIEWPORT_THRESHOLD) {
      const centerY = viewportHeight / 2 - (contentBounds.minY + contentBounds.maxY) / 2;
      return { min: centerY, max: centerY };
    }
    const min = viewportHeight - BOTTOM_VIEWPORT_PADDING - contentBounds.maxY;
    const max = DEFAULT_VIEWPORT.y - contentBounds.minY;
    if (min > max) {
      return { min, max: min };
    }
    return { min, max };
  }, [viewportHeight, nodes.length, contentBounds.maxY, contentBounds.minY]);

  const computePreferredViewport = () => {
    if (viewportHeight > 0 && contentBounds.height < viewportHeight * CENTER_VIEWPORT_THRESHOLD) {
      const centerY = viewportHeight / 2 - (contentBounds.minY + contentBounds.maxY) / 2;
      return {
        x: DEFAULT_VIEWPORT.x,
        y: centerY,
        zoom: 1
      } satisfies Viewport;
    }
    return {
      x: DEFAULT_VIEWPORT.x,
      y: viewportHeight - BOTTOM_VIEWPORT_PADDING - contentBounds.maxY,
      zoom: 1
    } satisfies Viewport;
  };

  const clampViewport = (viewport: Viewport) => {
    if (!viewportYBounds) return viewport;
    return {
      ...viewport,
      y: Math.min(Math.max(viewport.y, viewportYBounds.min), viewportYBounds.max)
    };
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
    const nodeCountChanged = prevNodeCountRef.current !== nodes.length;
    prevNodeCountRef.current = nodes.length;
    // If the view isn't scrollable, still align to the bottom so the newest node stays visible,
    // and mark follow-bottom so growth later keeps auto-scrolling.
    if (!shouldPanOnScroll) {
      const next = clampViewport(computePreferredViewport());
      instance.setViewport(next, { duration: 0 });
      viewportByModeRef.current[mode] = next;
      followBottomByModeRef.current[mode] = true;
      return;
    }
    if (nodeCountChanged) {
      const next = clampViewport(computePreferredViewport());
      instance.setViewport(next, { duration: 0 });
      viewportByModeRef.current[mode] = next;
      followBottomByModeRef.current[mode] = true;
      return;
    }
    const saved = viewportByModeRef.current[mode];
    if (saved) {
      const next = clampViewport({ ...saved, zoom: 1 });
      if (next.x > 0 && next.x < DEFAULT_VIEWPORT.x) next.x = DEFAULT_VIEWPORT.x;
      if (next.y > 0 && next.y < DEFAULT_VIEWPORT.y) next.y = DEFAULT_VIEWPORT.y;
      instance.setViewport(next, { duration: 0 });
    } else {
      const next = clampViewport(computePreferredViewport());
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
    const next = clampViewport(computePreferredViewport());
    instance.setViewport(next, { duration: 0 });
    viewportByModeRef.current[mode] = next;
  }, [flowInstance, mode, shouldPanOnScroll, nodes.length, viewportHeight, viewportYBounds]);

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
              nodes={decoratedNodes}
              edges={decoratedEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              defaultViewport={DEFAULT_VIEWPORT}
              onNodeClick={(_event, node) => {
                onSelectNode?.(node.id);
              }}
              onPaneClick={() => {
                onSelectNode?.(null);
              }}
              onInit={(instance) => {
                setFlowInstance(instance);
              }}
              onMoveEnd={(_event, viewport) => {
                const next = clampViewport({ ...viewport, zoom: 1 });
                viewportByModeRef.current[mode] = next;
                if (!shouldPanOnScroll) {
                  followBottomByModeRef.current[mode] = false;
                  return;
                }
                const target = clampViewport(computePreferredViewport());
                followBottomByModeRef.current[mode] = Math.abs(next.y - target.y) < 24;
                if (next.y !== viewport.y) {
                  flowInstance?.setViewport(next, { duration: 0 });
                }
	              }}
	              panOnScroll={shouldPanOnScroll}
	              panOnScrollMode={PanOnScrollMode.Vertical}
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
    const blocks = getContentBlocksWithLegacyFallback(node);
    const text = deriveTextFromBlocks(blocks) || node.content;
    return `${text.slice(0, 42)}${text.length > 42 ? '…' : ''}`;
  }
  throw new Error('Unhandled node type');
}
