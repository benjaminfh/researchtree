import React, { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { NodeRecord } from '@git/types';
import { useProjectData } from '@/src/hooks/useProjectData';

const createWrapper = () => {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig
      value={{
        provider: () => new Map(),
        dedupingInterval: 0,
        focusThrottleInterval: 0
      }}
    >
      {children}
    </SWRConfig>
  );
};

describe('useProjectData', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetches history and artefact data', async () => {
    const nodes: NodeRecord[] = [
      {
        id: '1',
        type: 'message',
        role: 'user',
        content: 'Hello',
        timestamp: 1,
        parent: null
      }
    ];

    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url.toString().includes('/history')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ nodes })
        } as Response);
      }
      if (url.toString().includes('/artefact')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ artefact: '# Artefact', lastUpdatedAt: 170000000 })
        } as Response);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectData('project-1'), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.nodes).toEqual(nodes);
    expect(result.current.artefact).toBe('# Artefact');
    expect(result.current.error).toBeUndefined();
  });

  it('includes ref in the history key when provided', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/history')) {
        if (!urlStr.includes('ref=feature%2Fone')) {
          throw new Error('Missing ref param');
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ nodes: [] })
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ artefact: '', lastUpdatedAt: null })
      } as Response);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectData('project-ref', { ref: 'feature/one' }), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.current.nodes).toEqual([]);
  });

  it('revalidates history when the window gains focus', async () => {
    const responses = [
      { nodes: [{ id: '1', type: 'message', role: 'assistant', content: 'First', timestamp: 1, parent: null }] },
      { nodes: [{ id: '2', type: 'message', role: 'assistant', content: 'Second', timestamp: 2, parent: null }] }
    ];

    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url.toString().includes('/history')) {
        const payload = responses.shift() ?? responses[0];
        return Promise.resolve({
          ok: true,
          json: async () => payload
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ artefact: '', lastUpdatedAt: null })
      } as Response);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectData('project-2'), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].content).toBe('First');
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      const historyCalls = fetchMock.mock.calls.filter((call) => call[0].toString().includes('/history')).length;
      expect(historyCalls).toBeGreaterThanOrEqual(2);
      expect(result.current.nodes[0].content).toBe('Second');
    });
  });

  it('surfaces errors from failed history fetches', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url.toString().includes('/history')) {
        return Promise.resolve({
          ok: false
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ artefact: '', lastUpdatedAt: null })
      } as Response);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useProjectData('project-3'), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    expect(result.current.nodes).toEqual([]);
    expect(result.current.artefact).toBe('');
  });
});
