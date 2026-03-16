// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from 'vitest';
import {
  buildGraphNodes,
  countCrossingsBounded,
  computeLabelTranslateX,
  computeRowLabelPlacement,
  layoutGraph,
  segmentsCrossInSharedSpan,
  type EdgeSegment,
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

    expect(result.usedFallback).toBe(false);
    expect(result.nodes).toHaveLength(nodes.length);
    expect(result.edges.length).toBe(nodes.length - 1);
    expect(result.nodes[0].position).toBeDefined();
  });

  it('computes per-row label shifts so trunk labels move when a branch occupies a right lane', () => {
    const nodes = makeForkMergeNodes();
    const result = layoutGraph(nodes, 'feature', 'main', undefined, { maxIterations: 500 });

    expect(result.usedFallback).toBe(false);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    // After the fork, at least one node in a multi-lane row should shift its label past the right-most reserved lane.
    const shifts = ['c', 'd', 'e'].map((id) => byId.get(id)?.data?.labelTranslateX ?? 0);
    expect(shifts.some((v) => v > 0)).toBe(true);
  });


  it('keeps fallback labels shifted when a branch edge passes through intermediate rows', () => {
    const nodes: GraphNode[] = [
      { id: 'a', parents: [], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'A' },
      { id: 'b', parents: ['a'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'B' },
      { id: 'c', parents: ['b'], laneBranchId: 'feature', originBranchId: 'feature', isOnActiveBranch: false, label: 'C' },
      { id: 'd', parents: ['b'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'D' },
      { id: 'e', parents: ['d'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'E' },
      { id: 'f', parents: ['c', 'e'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'F' }
    ];

    const result = layoutGraph(nodes, 'feature', 'main', undefined, { maxIterations: 0 });

    expect(result.usedFallback).toBe(true);
    const byId = new Map(result.nodes.map((node) => [node.id, node]));
    expect(byId.get('d')?.data?.labelTranslateX).toBeGreaterThan(0);
    expect(byId.get('e')?.data?.labelTranslateX).toBeGreaterThan(0);
  });
});

describe('label placement helpers', () => {
  it('computes row bounds from node lanes and edge spans (including pass-through rows)', () => {
    const placement = computeRowLabelPlacement([0, 0, 0, 0], [
      { fromRow: 0, toRow: 1, fromLane: 0, toLane: 0 },
      { fromRow: 0, toRow: 3, fromLane: 2, toLane: 0 }
    ]);

    expect(placement.rowBoundByIndex).toEqual([2, 2, 2, 2]);
    expect(placement.globalRowBound).toBe(2);
  });

  it('uses routed max lane bounds when provided by layout spans', () => {
    const placement = computeRowLabelPlacement([0, 0, 0], [
      { fromRow: 0, toRow: 2, fromLane: 0, toLane: 1, maxLane: 3 }
    ]);

    expect(placement.rowBoundByIndex).toEqual([3, 3, 3]);
    expect(placement.globalRowBound).toBe(3);
  });

  it('does not propagate unrelated endpoint-wide rows across long narrow spans', () => {
    const placement = computeRowLabelPlacement([3, 0, 0, 0], [
      { fromRow: 0, toRow: 0, fromLane: 3, toLane: 3 },
      { fromRow: 0, toRow: 3, fromLane: 0, toLane: 0, maxLane: 0 }
    ]);

    expect(placement.rowBoundByIndex).toEqual([3, 0, 0, 0]);
    expect(placement.globalRowBound).toBe(3);
  });

  it('translates labels differently for hug and left-aligned modes', () => {
    const lane = 0;
    const rowBound = 1;
    const globalRowBound = 3;

    const hug = computeLabelTranslateX(lane, rowBound, globalRowBound, 'hug');
    const leftAligned = computeLabelTranslateX(lane, rowBound, globalRowBound, 'left-aligned');

    expect(hug).toBe(14);
    expect(leftAligned).toBe(50);
    expect(leftAligned).toBeGreaterThan(hug);
  });
});

describe('crossing metrics', () => {
  it('counts crossings when lane ordering flips over shared row coverage', () => {
    const a: EdgeSegment = { startRow: 0, endRow: 4, startLane: 0, endLane: 4 };
    const b: EdgeSegment = { startRow: 0, endRow: 4, startLane: 4, endLane: 0 };

    expect(segmentsCrossInSharedSpan(a, b)).toBe(true);
    expect(countCrossingsBounded([a, b], 10)).toEqual({ status: 'ok', crossings: 1, comparisons: 1 });
  });

  it('does not count parallel segments as crossings', () => {
    const a: EdgeSegment = { startRow: 0, endRow: 4, startLane: 0, endLane: 1 };
    const b: EdgeSegment = { startRow: 0, endRow: 4, startLane: 2, endLane: 3 };

    expect(segmentsCrossInSharedSpan(a, b)).toBe(false);
  });

  it('does not count endpoint-only touches as crossings', () => {
    const a: EdgeSegment = { startRow: 0, endRow: 2, startLane: 0, endLane: 2 };
    const b: EdgeSegment = { startRow: 2, endRow: 4, startLane: 2, endLane: 0 };

    expect(segmentsCrossInSharedSpan(a, b)).toBe(false);
  });

  it('does not count segments with disjoint row spans as crossings', () => {
    const a: EdgeSegment = { startRow: 0, endRow: 1, startLane: 0, endLane: 3 };
    const b: EdgeSegment = { startRow: 3, endRow: 5, startLane: 3, endLane: 0 };

    expect(segmentsCrossInSharedSpan(a, b)).toBe(false);
  });

  it('uses shared-span interpolation before deciding if ordering flips', () => {
    const long: EdgeSegment = { startRow: 0, endRow: 6, startLane: 0, endLane: 6 };
    const partial: EdgeSegment = { startRow: 2, endRow: 5, startLane: 5, endLane: 2 };

    expect(segmentsCrossInSharedSpan(long, partial)).toBe(true);
  });

  it('returns metric unavailable when comparison budget is exhausted', () => {
    const segments: EdgeSegment[] = [
      { startRow: 0, endRow: 4, startLane: 0, endLane: 4 },
      { startRow: 0, endRow: 4, startLane: 4, endLane: 0 },
      { startRow: 0, endRow: 4, startLane: 1, endLane: 1 }
    ];

    expect(countCrossingsBounded(segments, 2)).toEqual({ status: 'unavailable', comparisons: 2, budget: 2 });
  });
});

describe('crossing-aware layout selection', () => {
  it('switches to fallback only when bounded metrics show strict crossing improvement', () => {
    const nodes: GraphNode[] = [
      { id: 'a', parents: [], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'A' },
      { id: 'b', parents: ['a'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'B' },
      { id: 'c', parents: ['a'], laneBranchId: 'feature', originBranchId: 'feature', isOnActiveBranch: false, label: 'C' },
      { id: 'd', parents: ['b', 'c'], laneBranchId: 'main', originBranchId: 'main', isOnActiveBranch: true, label: 'D' }
    ];

    const result = layoutGraph(nodes, 'feature', 'main', undefined, { maxIterations: 200, crossingComparisonBudget: 0 });

    // Budget exhaustion means metric is unavailable; selection remains on non-fallback layout.
    expect(result.usedFallback).toBe(false);
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
