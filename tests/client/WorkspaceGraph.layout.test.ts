// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import {
  buildGraphNodes,
  buildLayoutEdgeSegments,
  evaluateCrossingMetric,
  layoutGraph,
  type GraphNode
} from '@/src/components/workspace/WorkspaceGraph';

// Silence CSS import from React Flow when running in Vitest.
vi.mock('reactflow/dist/style.css', () => ({}));

vi.spyOn(console, 'warn').mockImplementation(() => {});

const makeLinearNodes = (count: number, branchId = 'feature'): GraphNode[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `n-${i}`,
    parents: i > 0 ? [`n-${i - 1}`] : [],
    laneBranchId: branchId,
    originBranchId: branchId,
    isOnActiveBranch: true,
    label: `Node ${i}`
  }));

const makeForkMergeNodes = (): GraphNode[] => [
  {
    id: 'a',
    parents: [],
    laneBranchId: 'main',
    originBranchId: 'main',
    isOnActiveBranch: true,
    label: 'A'
  },
  {
    id: 'b',
    parents: ['a'],
    laneBranchId: 'main',
    originBranchId: 'main',
    isOnActiveBranch: true,
    label: 'B'
  },
  // branch off at b
  {
    id: 'c',
    parents: ['b'],
    laneBranchId: 'feature',
    originBranchId: 'feature',
    isOnActiveBranch: false,
    label: 'C'
  },
  // trunk continues
  {
    id: 'd',
    parents: ['b'],
    laneBranchId: 'main',
    originBranchId: 'main',
    isOnActiveBranch: true,
    label: 'D'
  },
  // merge feature into trunk at e
  {
    id: 'e',
    parents: ['d', 'c'],
    laneBranchId: 'main',
    originBranchId: 'main',
    isOnActiveBranch: true,
    label: 'E'
  }
];

describe('layoutGraph', () => {
  it('falls back to the simple layout when the iteration budget is exhausted', () => {
    const nodes = makeLinearNodes(5);
    const result = layoutGraph(nodes, 'feature', 'main', undefined, { maxIterations: 0 });

    expect(result.usedFallback).toBe(true);
    expect(result.nodes).toHaveLength(nodes.length);
    expect(result.edges.every((edge) => edge.data?.style === 'angular' || edge.data?.style === 'curve')).toBe(true);
  });

  it('completes the GitGraph layout within the iteration budget', () => {
    const nodes = makeLinearNodes(6);
    const result = layoutGraph(nodes, 'feature', 'main', undefined, { maxIterations: 200 });

    expect(result.usedFallback).toBe(true);
    expect(result.nodes).toHaveLength(nodes.length);
    expect(result.edges.length).toBe(nodes.length - 1);
    expect(result.nodes[0].position).toBeDefined();
  });

  it('computes per-row label shifts so trunk labels move when a branch occupies a right lane', () => {
    const nodes = makeForkMergeNodes();
    const result = layoutGraph(nodes, 'feature', 'main', undefined, { maxIterations: 500 });

    expect(result.usedFallback).toBe(true);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    // After the fork, at least one node in a multi-lane row should shift its label past the right-most reserved lane.
    const shifts = ['c', 'd', 'e'].map((id) => byId.get(id)?.data?.labelTranslateX ?? 0);
    expect(shifts.some((v) => v > 0)).toBe(true);
  });



  it('switches to the GitGraph layout only when bounded crossings are strictly better', () => {
    const nodes: GraphNode[] = [
      { id: 'a', parents: [], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'A' },
      { id: 'b', parents: ['a'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'B' },
      { id: 'c', parents: ['a'], laneBranchId: 'feature', originBranchId: 'feature', isOnActiveBranch: false, label: 'C' },
      { id: 'd', parents: ['b', 'c'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'D' }
    ];

    const result = layoutGraph(nodes, 'feature', 'main', undefined, { maxIterations: 500 });
    expect(result.crossingMetric.status).toBe('ok');
    expect(result.crossingMetric.status === 'ok' ? result.crossingMetric.crossings : -1).toBe(0);
  });

  it('reports crossing metric unavailable when comparison budget is exhausted', () => {
    const nodes = makeForkMergeNodes();
    const result = layoutGraph(nodes, 'feature', 'main', undefined, {
      maxIterations: 500,
      crossingComparisonBudget: 1
    });

    expect(result.crossingMetric.status).toBe('unavailable');
  });
});

describe('crossing metric', () => {
  it('counts a crossing when lane ordering flips across a shared span', () => {
    const segments = [
      { edgeId: 'a', startRow: 0, endRow: 10, startLane: 0, endLane: 10 },
      { edgeId: 'b', startRow: 0, endRow: 10, startLane: 10, endLane: 0 }
    ];

    const metric = evaluateCrossingMetric(segments, 10);
    expect(metric).toMatchObject({ status: 'ok', crossings: 1 });
  });

  it('does not count non-crossings when lane ordering does not flip', () => {
    const segments = [
      { edgeId: 'a', startRow: 0, endRow: 10, startLane: 0, endLane: 2 },
      { edgeId: 'b', startRow: 0, endRow: 10, startLane: 5, endLane: 7 }
    ];

    const metric = evaluateCrossingMetric(segments, 10);
    expect(metric).toMatchObject({ status: 'ok', crossings: 0 });
  });

  it('does not count endpoint-only touches as crossings', () => {
    const segments = [
      { edgeId: 'a', startRow: 0, endRow: 10, startLane: 0, endLane: 10 },
      { edgeId: 'b', startRow: 10, endRow: 20, startLane: 10, endLane: 0 }
    ];

    const metric = evaluateCrossingMetric(segments, 10);
    expect(metric).toMatchObject({ status: 'ok', crossings: 0 });
  });

  it('does not count disjoint spans as crossings', () => {
    const segments = [
      { edgeId: 'a', startRow: 0, endRow: 8, startLane: 0, endLane: 10 },
      { edgeId: 'b', startRow: 12, endRow: 20, startLane: 10, endLane: 0 }
    ];

    const metric = evaluateCrossingMetric(segments, 10);
    expect(metric).toMatchObject({ status: 'ok', crossings: 0 });
  });

  it('uses interpolation across shared spans before deciding crossings', () => {
    const segments = [
      { edgeId: 'a', startRow: 0, endRow: 20, startLane: 0, endLane: 20 },
      { edgeId: 'b', startRow: 10, endRow: 30, startLane: 11, endLane: 9 }
    ];

    const metric = evaluateCrossingMetric(segments, 10);
    expect(metric).toMatchObject({ status: 'ok', crossings: 1 });
  });

  it('returns unavailable when pairwise comparisons exceed budget', () => {
    const segments = [
      { edgeId: 'a', startRow: 0, endRow: 10, startLane: 0, endLane: 1 },
      { edgeId: 'b', startRow: 0, endRow: 10, startLane: 2, endLane: 3 },
      { edgeId: 'c', startRow: 0, endRow: 10, startLane: 4, endLane: 5 }
    ];

    const metric = evaluateCrossingMetric(segments, 1);
    expect(metric).toMatchObject({ status: 'unavailable' });
  });

  it('builds reusable edge-segment representations from layout nodes/edges', () => {
    const nodes = makeLinearNodes(2).map((node, index) => ({
      id: node.id,
      type: 'dot' as const,
      position: { x: index * 10, y: index * 10 },
      data: {
        label: node.label,
        color: '#000',
        originBranchId: node.originBranchId,
        isActive: node.isOnActiveBranch,
        labelTranslateX: 0
      },
      sourcePosition: 'bottom' as const,
      targetPosition: 'top' as const
    }));
    const edges = [{ id: 'n-0-n-1', source: 'n-0', target: 'n-1', type: 'git' as const, data: { color: '#000', style: 'angular' as const, lockedFirst: true } }];

    const segments = buildLayoutEdgeSegments(nodes as any, edges as any);
    expect(segments).toEqual([
      {
        edgeId: 'n-0-n-1',
        startRow: 0,
        endRow: 10,
        startLane: 0,
        endLane: 10
      }
    ]);
  });
});

describe('buildGraphNodes', () => {
  it('uses only the merge-parent head node (no sourceNodeIds fan-out)', () => {
    const branchHistories = {
      main: [
        { id: 'a', type: 'message', role: 'user', content: 'a', timestamp: 1, parent: null },
        { id: 'b', type: 'message', role: 'assistant', content: 'b', timestamp: 2, parent: 'a' },
        { id: 'd', type: 'message', role: 'assistant', content: 'd', timestamp: 4, parent: 'b' },
        {
          id: 'm',
          type: 'merge',
          mergeFrom: 'feature',
          mergeSummary: 'merge',
          sourceCommit: 'c',
          sourceNodeIds: ['c1', 'c2', 'c3'],
          timestamp: 5,
          parent: 'd'
        }
      ],
      feature: [
        { id: 'a', type: 'message', role: 'user', content: 'a', timestamp: 1, parent: null },
        { id: 'b', type: 'message', role: 'assistant', content: 'b', timestamp: 2, parent: 'a' },
        { id: 'c1', type: 'message', role: 'user', content: 'c1', timestamp: 3, parent: 'b' },
        { id: 'c2', type: 'message', role: 'assistant', content: 'c2', timestamp: 3, parent: 'c1' },
        { id: 'c3', type: 'message', role: 'assistant', content: 'c3', timestamp: 3, parent: 'c2' }
      ]
    } as any;

    const graphNodes = buildGraphNodes(branchHistories, 'main', 'main');
    const merge = graphNodes.find((n) => n.id === 'm')!;
    expect(merge.parents).toEqual(['d', 'c3']);
    expect(merge.parents).not.toContain('c1');
    expect(merge.parents).not.toContain('c2');
  });

  it('assigns shared nodes to trunk lane regardless of branch entry order', () => {
    const mainNodes = [
      { id: 'a', type: 'message', role: 'user', content: 'a', timestamp: 1, parent: null },
      { id: 'b', type: 'message', role: 'assistant', content: 'b', timestamp: 2, parent: 'a' }
    ];
    const featureNodes = [
      { id: 'a', type: 'message', role: 'user', content: 'a', timestamp: 1, parent: null },
      { id: 'b', type: 'message', role: 'assistant', content: 'b', timestamp: 2, parent: 'a' },
      { id: 'c', type: 'message', role: 'user', content: 'c', timestamp: 3, parent: 'b' }
    ];

    const branchHistoriesFeatureFirst = { feature: featureNodes, main: mainNodes } as any;
    const branchHistoriesMainFirst = { main: mainNodes, feature: featureNodes } as any;

    const nodesA = buildGraphNodes(branchHistoriesFeatureFirst, 'feature', 'main');
    const nodesB = buildGraphNodes(branchHistoriesMainFirst, 'feature', 'main');

    const byIdA = new Map(nodesA.map((n) => [n.id, n]));
    const byIdB = new Map(nodesB.map((n) => [n.id, n]));

    expect(byIdA.get('a')?.laneBranchId).toBe('main');
    expect(byIdB.get('a')?.laneBranchId).toBe('main');
    expect(byIdA.get('b')?.laneBranchId).toBe('main');
    expect(byIdB.get('b')?.laneBranchId).toBe('main');
    expect(byIdA.get('c')?.laneBranchId).toBe('feature');
    expect(byIdB.get('c')?.laneBranchId).toBe('feature');
  });
});
