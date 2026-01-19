// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceGraph } from '@/src/components/workspace/WorkspaceGraph';

// Silence CSS import from React Flow when running in Vitest.
vi.mock('reactflow/dist/style.css', () => ({}));

let lastFlowInstance: { setViewport: ReturnType<typeof vi.fn> } | null = null;
let lastOnMoveEnd: ((event: any, viewport: any) => void) | null = null;

const ROW_SPACING = 45;
const BOTTOM_VIEWPORT_PADDING = 56;
const CENTER_VIEWPORT_THRESHOLD = 0.75;
const branchNameById = { main: 'main', 'feature/x': 'feature/x' };

const expectedPreferredY = (nodeCount: number, viewportHeight: number) => {
  if (nodeCount <= 0) return 0;
  const maxY = (nodeCount - 1) * ROW_SPACING;
  const contentHeight = maxY + ROW_SPACING;
  if (contentHeight < viewportHeight * CENTER_VIEWPORT_THRESHOLD) {
    return viewportHeight / 2 - maxY / 2;
  }
  return viewportHeight - BOTTOM_VIEWPORT_PADDING - maxY;
};

vi.mock('reactflow', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({
      onInit,
      onMoveEnd,
      children
    }: {
      onInit?: (instance: any) => void;
      onMoveEnd?: (event: any, viewport: any) => void;
      children?: React.ReactNode;
    }) => {
      lastOnMoveEnd = onMoveEnd ?? null;
      const didInit = React.useRef(false);
      React.useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        lastFlowInstance = { setViewport: vi.fn() };
        onInit?.(lastFlowInstance);
      }, []);
      return <div data-testid="react-flow">{children}</div>;
    },
    Background: () => null,
    Handle: () => null,
    PanOnScrollMode: { Vertical: 'vertical' },
    Position: { Top: 'top', Bottom: 'bottom' }
  };
});

describe('WorkspaceGraph viewport initialization', () => {
  beforeEach(() => {
    lastFlowInstance = null;
    lastOnMoveEnd = null;
    // JSDOM doesn't ship ResizeObserver.
    (globalThis as any).ResizeObserver = class ResizeObserver {
      private cb: (entries: Array<{ contentRect: { height: number } }>) => void;
      constructor(cb: (entries: Array<{ contentRect: { height: number } }>) => void) {
        this.cb = cb;
      }
      observe() {
        this.cb([{ contentRect: { height: 600 } }]);
      }
      disconnect() {}
    };
  });

  it('applies the default viewport on initial mount (without requiring a mode toggle)', async () => {
    const trunkName = 'main';
    const branchHistories = {
      main: [
        { id: 'a', type: 'message', role: 'user', content: 'Hi', timestamp: 1, parent: null, createdOnBranch: 'main' },
        { id: 'b', type: 'message', role: 'assistant', content: 'Hello', timestamp: 2, parent: 'a', createdOnBranch: 'main' }
      ],
      'feature/x': [
        { id: 'a', type: 'message', role: 'user', content: 'Hi', timestamp: 1, parent: null, createdOnBranch: 'main' },
        {
          id: 'b',
          type: 'message',
          role: 'assistant',
          content: 'Hello',
          timestamp: 2,
          parent: 'a',
          createdOnBranch: 'main'
        }
      ]
    } as any;

    render(
      <WorkspaceGraph
        branchHistories={branchHistories}
        activeBranchId="feature/x"
        trunkId={trunkName}
        branchNameById={branchNameById}
        mode="nodes"
      />
    );

    await waitFor(() => {
      expect(lastFlowInstance).not.toBeNull();
      expect(lastFlowInstance!.setViewport).toHaveBeenCalled();
    });

    const calls = lastFlowInstance!.setViewport.mock.calls;
    const [viewportArg] = calls[calls.length - 1] ?? [];
    expect(viewportArg).toMatchObject({ x: 48, zoom: 1 });
    expect(viewportArg?.y).toBeCloseTo(expectedPreferredY(2, 600), 3);
  });

  it('pins to the bottom when the graph overflows vertically', async () => {
    const trunkName = 'main';
    const nodes = Array.from({ length: 40 }, (_, i) => ({
      id: `n-${i}`,
      type: 'message',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `node ${i}`,
      timestamp: i + 1,
      parent: i === 0 ? null : `n-${i - 1}`,
      createdOnBranch: 'main'
    }));
    const branchHistories = { main: nodes, 'feature/x': nodes } as any;

    render(
      <WorkspaceGraph
        branchHistories={branchHistories}
        activeBranchId="feature/x"
        trunkId={trunkName}
        branchNameById={branchNameById}
        mode="nodes"
      />
    );

    await waitFor(() => {
      expect(lastFlowInstance).not.toBeNull();
      expect(lastFlowInstance!.setViewport).toHaveBeenCalled();
    });

    const calls = lastFlowInstance!.setViewport.mock.calls;
    const [viewportArg] = calls[calls.length - 1] ?? [];
    const maxY = (nodes.length - 1) * ROW_SPACING;
    const expectedY = 600 - BOTTOM_VIEWPORT_PADDING - maxY;
    expect(viewportArg).toMatchObject({ x: 48, zoom: 1 });
    expect(Math.abs((viewportArg?.y ?? 0) - expectedY)).toBeLessThan(1);
  });

  it('keeps following the bottom when already pinned and new nodes arrive', async () => {
    const trunkName = 'main';
    const makeNodes = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `n-${i}`,
        type: 'message',
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `node ${i}`,
        timestamp: i + 1,
        parent: i === 0 ? null : `n-${i - 1}`,
        createdOnBranch: 'main'
      }));

    const { rerender } = render(
      <WorkspaceGraph
        branchHistories={{ main: makeNodes(30), 'feature/x': makeNodes(30) } as any}
        activeBranchId="feature/x"
        trunkId={trunkName}
        branchNameById={branchNameById}
        mode="nodes"
      />
    );

    await waitFor(() => {
      expect(lastFlowInstance).not.toBeNull();
      expect(lastFlowInstance!.setViewport).toHaveBeenCalled();
    });

    const initialCount = lastFlowInstance!.setViewport.mock.calls.length;
    const firstViewport = lastFlowInstance!.setViewport.mock.calls[initialCount - 1]?.[0];

    rerender(
      <WorkspaceGraph
        branchHistories={{ main: makeNodes(31), 'feature/x': makeNodes(31) } as any}
        activeBranchId="feature/x"
        trunkId={trunkName}
        branchNameById={branchNameById}
        mode="nodes"
      />
    );

    await waitFor(() => {
      expect(lastFlowInstance!.setViewport.mock.calls.length).toBeGreaterThan(initialCount);
    });

    const secondCalls = lastFlowInstance!.setViewport.mock.calls;
    const secondViewport = secondCalls[secondCalls.length - 1]?.[0];
    expect(secondViewport?.y).toBeLessThan(firstViewport?.y);
  });

  it('stops following the bottom after the user scrolls up', async () => {
    const trunkName = 'main';
    const makeNodes = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `n-${i}`,
        type: 'message',
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `node ${i}`,
        timestamp: i + 1,
        parent: i === 0 ? null : `n-${i - 1}`,
        createdOnBranch: 'main'
      }));

    const { rerender } = render(
      <WorkspaceGraph
        branchHistories={{ main: makeNodes(30), 'feature/x': makeNodes(30) } as any}
        activeBranchId="feature/x"
        trunkId={trunkName}
        branchNameById={branchNameById}
        mode="nodes"
      />
    );

    await waitFor(() => {
      expect(lastFlowInstance).not.toBeNull();
      expect(lastOnMoveEnd).not.toBeNull();
    });

    // Simulate user panning away from the bottom.
    lastOnMoveEnd?.(null, { x: 48, y: 0, zoom: 1 });

    const before = lastFlowInstance!.setViewport.mock.calls.length;
    rerender(
      <WorkspaceGraph
        branchHistories={{ main: makeNodes(31), 'feature/x': makeNodes(31) } as any}
        activeBranchId="feature/x"
        trunkId={trunkName}
        branchNameById={branchNameById}
        mode="nodes"
      />
    );

    await waitFor(() => {
      expect(lastFlowInstance!.setViewport.mock.calls.length).toBeGreaterThan(before);
    });

    const calls = lastFlowInstance!.setViewport.mock.calls;
    const lastViewport = calls[calls.length - 1]?.[0];
    expect(lastViewport?.y).toBeCloseTo(expectedPreferredY(31, 600), 3);
  });
});
