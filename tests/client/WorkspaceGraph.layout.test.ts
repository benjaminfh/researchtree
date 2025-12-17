import { describe, it, expect, vi } from 'vitest';
import { layoutGraph, type GraphNode } from '@/src/components/workspace/WorkspaceGraph';

// Silence CSS import from React Flow when running in Vitest.
vi.mock('reactflow/dist/style.css', () => ({}));

const makeLinearNodes = (count: number, branchId = 'feature'): GraphNode[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `n-${i}`,
    parents: i > 0 ? [`n-${i - 1}`] : [],
    laneBranchId: branchId,
    originBranchId: branchId,
    isOnActiveBranch: true,
    label: `Node ${i}`
  }));

describe('layoutGraph', () => {
  it('falls back to the simple layout when the iteration budget is exhausted', () => {
    const nodes = makeLinearNodes(5);
    const result = layoutGraph(nodes, 'feature', 'main', { maxIterations: 1 });

    expect(result.usedFallback).toBe(true);
    expect(result.nodes).toHaveLength(nodes.length);
    expect(result.edges.every((edge) => edge.data?.style === 'angular' || edge.data?.style === 'curve')).toBe(true);
  });

  it('completes the GitGraph layout within the iteration budget', () => {
    const nodes = makeLinearNodes(6);
    const result = layoutGraph(nodes, 'feature', 'main', { maxIterations: 200 });

    expect(result.usedFallback).toBe(false);
    expect(result.nodes).toHaveLength(nodes.length);
    expect(result.edges.length).toBe(nodes.length - 1);
    expect(result.nodes[0].position).toBeDefined();
  });
});
