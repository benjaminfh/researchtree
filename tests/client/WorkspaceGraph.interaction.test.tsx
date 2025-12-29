// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceGraph } from '@/src/components/workspace/WorkspaceGraph';

// Silence CSS import from React Flow when running in Vitest.
vi.mock('reactflow/dist/style.css', () => ({}));

let lastNodes: any[] | null = null;
let lastOnNodeClick: ((event: any, node: any) => void) | null = null;
let lastOnPaneClick: (() => void) | null = null;

vi.mock('reactflow', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({
      nodes,
      onNodeClick,
      onPaneClick,
      children
    }: {
      nodes?: any[];
      onNodeClick?: (event: any, node: any) => void;
      onPaneClick?: () => void;
      children?: React.ReactNode;
    }) => {
      lastNodes = nodes ?? null;
      lastOnNodeClick = onNodeClick ?? null;
      lastOnPaneClick = onPaneClick ?? null;
      return <div data-testid="react-flow">{children}</div>;
    },
    Background: () => null,
    Handle: () => null,
    PanOnScrollMode: { Vertical: 'vertical' },
    Position: { Top: 'top', Bottom: 'bottom' }
  };
});

describe('WorkspaceGraph interaction', () => {
  beforeEach(() => {
    lastNodes = null;
    lastOnNodeClick = null;
    lastOnPaneClick = null;
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

  it('marks branch heads and forwards node selection', async () => {
    const onSelectNode = vi.fn();
    const branchHistories = {
      main: [
        { id: 'a', type: 'message', role: 'user', content: 'A', timestamp: 1, parent: null, createdOnBranch: 'main' },
        { id: 'b', type: 'message', role: 'assistant', content: 'B', timestamp: 2, parent: 'a', createdOnBranch: 'main' }
      ],
      'feature/x': [
        { id: 'a', type: 'message', role: 'user', content: 'A', timestamp: 1, parent: null, createdOnBranch: 'main' },
        { id: 'b', type: 'message', role: 'assistant', content: 'B', timestamp: 2, parent: 'a', createdOnBranch: 'main' },
        { id: 'c', type: 'message', role: 'user', content: 'C', timestamp: 3, parent: 'b', createdOnBranch: 'feature/x' }
      ]
    } as any;

    render(
      <WorkspaceGraph
        branchHistories={branchHistories}
        activeBranchName="feature/x"
        trunkName="main"
        mode="nodes"
        selectedNodeId="b"
        onSelectNode={onSelectNode}
      />
    );

    await waitFor(() => {
      expect(lastNodes).not.toBeNull();
      expect(lastOnNodeClick).not.toBeNull();
    });

    const byId = new Map((lastNodes ?? []).map((n) => [n.id, n]));
    expect(byId.get('c')?.data?.isActiveHead).toBe(true);
    expect(byId.get('b')?.data?.isActiveHead).toBe(false);
    expect(byId.get('b')?.data?.isSelected).toBe(true);

    lastOnNodeClick?.(null, { id: 'c' });
    expect(onSelectNode).toHaveBeenCalledWith('c');

    lastOnPaneClick?.();
    expect(onSelectNode).toHaveBeenCalledWith(null);
  });
});
