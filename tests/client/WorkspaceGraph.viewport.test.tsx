import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceGraph } from '@/src/components/workspace/WorkspaceGraph';

// Silence CSS import from React Flow when running in Vitest.
vi.mock('reactflow/dist/style.css', () => ({}));

let lastFlowInstance: { setViewport: ReturnType<typeof vi.fn> } | null = null;

vi.mock('reactflow', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ onInit, children }: { onInit?: (instance: any) => void; children?: React.ReactNode }) => {
      React.useEffect(() => {
        lastFlowInstance = { setViewport: vi.fn() };
        onInit?.(lastFlowInstance);
      }, [onInit]);
      return <div data-testid="react-flow">{children}</div>;
    },
    Background: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' }
  };
});

describe('WorkspaceGraph viewport initialization', () => {
  beforeEach(() => {
    lastFlowInstance = null;
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

    render(<WorkspaceGraph branchHistories={branchHistories} activeBranchName="feature/x" trunkName={trunkName} mode="nodes" />);

    await waitFor(() => {
      expect(lastFlowInstance).not.toBeNull();
      expect(lastFlowInstance!.setViewport).toHaveBeenCalled();
    });

    const calls = lastFlowInstance!.setViewport.mock.calls;
    const [viewportArg] = calls[calls.length - 1] ?? [];
    expect(viewportArg).toMatchObject({ x: 48, y: 88, zoom: 1 });
  });
});
