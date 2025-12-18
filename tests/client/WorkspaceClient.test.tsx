import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProjectMetadata, NodeRecord } from '@git/types';
import { WorkspaceClient } from '@/src/components/workspace/WorkspaceClient';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';

let capturedWorkspaceGraphProps: any = null;

vi.mock('@/src/components/workspace/WorkspaceGraph', () => ({
  WorkspaceGraph: (props: any) => {
    capturedWorkspaceGraphProps = props;
    return <div data-testid="workspace-graph" />;
  }
}));

vi.mock('reactflow', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
    Background: () => null,
    Controls: () => null
  };
});

vi.mock('@/src/hooks/useProjectData', () => ({
  useProjectData: vi.fn()
}));

vi.mock('@/src/hooks/useChatStream', () => ({
  useChatStream: vi.fn()
}));

const mockUseProjectData = vi.mocked(useProjectData);
const mockUseChatStream = vi.mocked(useChatStream);

const baseProject: ProjectMetadata = {
  id: 'proj-1',
  name: 'Workspace Project',
  description: 'Test project description',
  createdAt: new Date().toISOString(),
  branchName: 'feature/phase-2'
};

const baseBranches = [
  { name: 'main', headCommit: 'abc', nodeCount: 2, isTrunk: true },
  { name: 'feature/phase-2', headCommit: 'def', nodeCount: 2, isTrunk: false }
] as const;

const providerOptions = [
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-5.2' },
  { id: 'gemini', label: 'Gemini', defaultModel: 'gemini-3.0-pro' },
  { id: 'mock', label: 'Mock', defaultModel: 'mock' }
] as const;

const sampleNodes: NodeRecord[] = [
  {
    id: 'node-user',
    type: 'message',
    role: 'user',
    content: 'How is progress going?',
    timestamp: 1700000000000,
    parent: null
  },
  {
    id: 'node-assistant',
    type: 'message',
    role: 'assistant',
    content: 'All tasks queued.',
    timestamp: 1700000001000,
    parent: 'node-user'
  },
  {
    id: 'node-user-branch',
    type: 'message',
    role: 'user',
    content: 'Branch-only follow-up.',
    timestamp: 1700000002000,
    parent: 'node-assistant'
  }
];

describe('WorkspaceClient', () => {
  let mutateHistoryMock: ReturnType<typeof vi.fn>;
  let mutateArtefactMock: ReturnType<typeof vi.fn>;
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let interruptMock: ReturnType<typeof vi.fn>;
  let chatState: { isStreaming: boolean; error: string | null };
  let capturedChatOptions: Parameters<typeof useChatStream>[0] | null;

  beforeEach(() => {
    mutateHistoryMock = vi.fn().mockResolvedValue(undefined);
    mutateArtefactMock = vi.fn().mockResolvedValue(undefined);
    sendMessageMock = vi.fn().mockResolvedValue(undefined);
    interruptMock = vi.fn().mockResolvedValue(undefined);
    chatState = { isStreaming: false, error: null };
    capturedChatOptions = null;
    capturedWorkspaceGraphProps = null;
    window.sessionStorage.clear();
    window.localStorage.clear();

    mockUseProjectData.mockReturnValue({
      nodes: sampleNodes,
      artefact: '## Artefact state',
      artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
      isLoading: false,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    mockUseChatStream.mockImplementation((options) => {
      capturedChatOptions = options;
      return {
        sendMessage: sendMessageMock,
        interrupt: interruptMock,
        state: chatState
      };
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('/stars')) {
        return new Response(JSON.stringify({ starredNodeIds: [] }), { status: 200 });
      }
      if (url.includes('/history')) {
        const nodes = url.includes('ref=main') ? sampleNodes.slice(0, 2) : sampleNodes;
        return new Response(JSON.stringify({ nodes }), { status: 200 });
      }
      if (url.includes('/branches') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ branchName: 'main', branches: baseBranches }), { status: 200 });
      }
      if (url.includes('/artefact')) {
        return new Response(JSON.stringify({ artefact: '## Artefact state', lastUpdatedAt: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders metadata, nodes, and artefact content', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    expect(screen.getByText('Workspace Project')).toBeInTheDocument();
    expect(screen.getByText(/Branch\s+feature\/phase-2\s+·/)).toBeInTheDocument();
    expect(screen.getByText('Test project description')).toBeInTheDocument();

    // Reveal shared history on non-trunk branches before asserting messages.
    await user.click(await screen.findByRole('button', { name: /show shared/i }));

    expect(screen.getByText('How is progress going?')).toBeInTheDocument();
    expect(screen.getByText('All tasks queued.')).toBeInTheDocument();
    expect(screen.getByText('Branch-only follow-up.')).toBeInTheDocument();
    expect(screen.getByText('Artefact state')).toBeInTheDocument();

    // Copy is exposed for every message, while edit is only exposed for user messages by default.
    expect(screen.getAllByRole('button', { name: 'Copy message' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Edit message' })).toHaveLength(1);
  });

  it('sends the draft when the user presses ⌘+Enter', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    const composer = screen.getByPlaceholderText('Ask anything');
    await user.type(composer, 'New investigation');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith('New investigation');
    });
  });

  it('displays streaming previews when onChunk emits tokens', async () => {
    mockUseProjectData.mockReturnValueOnce({
      nodes: [],
      artefact: '',
      artefactMeta: null,
      isLoading: false,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    expect(capturedChatOptions).not.toBeNull();

    await act(async () => {
      capturedChatOptions?.onChunk?.('partial response');
    });

    expect(screen.getByText('partial response')).toBeInTheDocument();
  });

  it('refreshes history and artefact when the stream completes', async () => {
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);
    expect(capturedChatOptions).not.toBeNull();

    await act(async () => {
      await capturedChatOptions?.onComplete?.();
    });

    expect(mutateHistoryMock).toHaveBeenCalledTimes(1);
    expect(mutateArtefactMock).toHaveBeenCalledTimes(1);
  });

  it('adds a merge canvas diff into context as a persisted assistant message', async () => {
    const user = userEvent.setup();
    const nodesWithMerge: NodeRecord[] = [
      ...sampleNodes,
      {
        id: 'merge-1',
        type: 'merge',
        mergeFrom: 'feature/phase-1',
        mergeSummary: 'Bring back canvas changes',
        sourceCommit: 'abc',
        sourceNodeIds: [],
        canvasDiff: '+hello',
        timestamp: 1700000003000,
        parent: 'node-user-branch'
      }
    ];

    mockUseProjectData.mockReturnValueOnce({
      nodes: nodesWithMerge,
      artefact: '## Artefact state',
      artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
      isLoading: false,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    render(
      <WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />
    );

    expect(screen.getByText('Merge: Bring back canvas changes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add canvas diff to context' }));
    await user.click(screen.getByRole('button', { name: 'Confirm add canvas diff to context' }));

    await waitFor(() => {
      expect(mutateHistoryMock).toHaveBeenCalled();
    });

    const pinCall = (global.fetch as any).mock.calls.find(
      ([input]: [RequestInfo | URL]) => input.toString().includes('/merge/pin-canvas-diff')
    );
    expect(pinCall).toBeTruthy();
    const [, init] = pinCall as [RequestInfo | URL, RequestInit];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ mergeNodeId: 'merge-1', targetBranch: 'feature/phase-2' });
  });

  it('merges using the selected assistant payload message', async () => {
    const user = userEvent.setup();
    const nodesWithBranchAssistant: NodeRecord[] = [
      ...sampleNodes,
      {
        id: 'node-assistant-branch',
        type: 'message',
        role: 'assistant',
        content: 'Branch final payload.',
        timestamp: 1700000002500,
        parent: 'node-user-branch'
      }
    ];

    mockUseProjectData.mockReturnValueOnce({
      nodes: nodesWithBranchAssistant,
      artefact: '## Artefact state',
      artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
      isLoading: false,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    render(
      <WorkspaceClient
        project={baseProject}
        initialBranches={baseBranches as any}
        defaultProvider="openai"
        providerOptions={providerOptions}
      />
    );

    await user.click(screen.getByRole('button', { name: /merge into trunk/i }));
    expect(await screen.findByText(/merge summary/i)).toBeInTheDocument();
    expect(screen.getByText('Branch final payload.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Merge summary'), 'Bring back the final payload');

    const mergeButtons = screen.getAllByRole('button', { name: /merge into trunk/i });
    const confirmButton = mergeButtons[mergeButtons.length - 1];
    await waitFor(() => {
      expect(confirmButton).not.toBeDisabled();
    });
    await user.click(confirmButton);

    const mergeCall = (global.fetch as any).mock.calls.find(
      ([input]: [RequestInfo | URL]) => input.toString().includes('/api/projects/proj-1/merge')
    );
    expect(mergeCall).toBeTruthy();
    const [, init] = mergeCall as [RequestInfo | URL, RequestInit];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      sourceBranch: 'feature/phase-2',
      targetBranch: 'main',
      mergeSummary: 'Bring back the final payload',
      sourceAssistantNodeId: 'node-assistant-branch'
    });
  });

  it('shows stop controls and error text while streaming', async () => {
    chatState.isStreaming = true;
    chatState.error = 'Network issue';
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    expect(screen.getByLabelText('Stop streaming')).toBeInTheDocument();
    expect(screen.getByText('Network issue')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Stop streaming' }));

    expect(interruptMock).toHaveBeenCalledTimes(1);
  });

  it('renders loading and error states from the history hook', () => {
    mockUseProjectData.mockReturnValueOnce({
      nodes: [],
      artefact: '',
      artefactMeta: null,
      isLoading: true,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    const { rerender } = render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);
    expect(screen.getByText('Loading history…')).toBeInTheDocument();

    mockUseProjectData.mockReturnValueOnce({
      nodes: [],
      artefact: '',
      artefactMeta: null,
      isLoading: false,
      error: new Error('boom'),
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    rerender(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);
    expect(screen.getByText('Failed to load history.')).toBeInTheDocument();
  });

  it('updates the chat stream provider when the selector changes', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);
    expect(capturedChatOptions?.provider).toBe('openai');

    await user.selectOptions(screen.getByLabelText(/Provider/i), 'gemini');

    expect(capturedChatOptions?.provider).toBe('gemini');
    expect(window.localStorage.getItem('researchtree:provider:proj-1:feature/phase-2')).toBe('gemini');
  });

  it('updates and persists the thinking mode selection', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    const thinkingTrigger = screen.getByRole('button', { name: 'Thinking mode' });
    expect(thinkingTrigger).toHaveTextContent('Thinking: Medium');

    await user.click(thinkingTrigger);
    await user.click(screen.getByRole('menuitemradio', { name: 'High' }));

    expect(thinkingTrigger).toHaveTextContent('Thinking: High');
    expect(window.localStorage.getItem('researchtree:thinking:proj-1:feature/phase-2')).toBe('high');
    await waitFor(() => {
      expect(capturedChatOptions?.thinking).toBe('high');
    });
  });

  it('patch-updates graph histories when the graph is visible and history changes', async () => {
    const user = userEvent.setup();
    let currentNodes = [...sampleNodes];

    mockUseProjectData.mockImplementation(
      () =>
        ({
          nodes: currentNodes,
          artefact: '## Artefact state',
          artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
          isLoading: false,
          error: undefined,
          mutateHistory: mutateHistoryMock,
          mutateArtefact: mutateArtefactMock
        }) as ReturnType<typeof useProjectData>
    );

    const { rerender } = render(
      <WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />
    );

    await user.click(screen.getByRole('button', { name: /quest graph/i }));

    await waitFor(() => {
      expect(capturedWorkspaceGraphProps).not.toBeNull();
      expect(capturedWorkspaceGraphProps.mode).toBe('collapsed');
      expect(capturedWorkspaceGraphProps.branchHistories?.['feature/phase-2']?.length).toBe(2);
    });

    currentNodes = [
      ...currentNodes,
      { id: 'node-3', type: 'message', role: 'assistant', content: 'New node', timestamp: 1700000002000, parent: 'node-assistant' } as any
    ];
    rerender(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    await waitFor(() => {
      expect(capturedWorkspaceGraphProps.branchHistories?.['feature/phase-2']?.length).toBe(3);
    });
  });

  it('scrolls to the bottom when switching branches', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    const list = await screen.findByTestId('chat-message-list');
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true, configurable: true });

    // requestAnimationFrame is used for the scroll; make it immediate for the test.
    const raf = globalThis.requestAnimationFrame;
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0 as any;
    };

    await user.click(screen.getByRole('button', { name: 'trunk' }));

    await waitFor(() => {
      expect((list as any).scrollTop).toBe(2000);
    });

    (globalThis as any).requestAnimationFrame = raf;
  });

  it('keeps the chat pinned to bottom when new nodes arrive', async () => {
    const user = userEvent.setup();
    let currentNodes = [...sampleNodes];

    mockUseProjectData.mockImplementation(
      () =>
        ({
          nodes: currentNodes,
          artefact: '## Artefact state',
          artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
          isLoading: false,
          error: undefined,
          mutateHistory: mutateHistoryMock,
          mutateArtefact: mutateArtefactMock
        }) as ReturnType<typeof useProjectData>
    );

    const { rerender } = render(
      <WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />
    );

    await user.click(await screen.findByRole('button', { name: /show shared/i }));

    const list = await screen.findByTestId('chat-message-list');
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 2000, writable: true, configurable: true });

    const raf = globalThis.requestAnimationFrame;
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0 as any;
    };

    Object.defineProperty(list, 'scrollHeight', { value: 3000, configurable: true });
    currentNodes = [
      ...currentNodes,
      { id: 'node-new', type: 'message', role: 'assistant', content: 'Newest node', timestamp: 1700000003000, parent: 'node-user-branch' } as any
    ];
    rerender(<WorkspaceClient project={baseProject} initialBranches={baseBranches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    await waitFor(() => {
      expect((list as any).scrollTop).toBe(3000);
    });

    (globalThis as any).requestAnimationFrame = raf;
  });

  it('renders a stripe for every visible node row (including user and assistant)', async () => {
    const user = userEvent.setup();
    const branches = [
      { name: 'main', headCommit: 'abc', nodeCount: 1, isTrunk: true },
      { name: 'feature/phase-2', headCommit: 'def', nodeCount: 2, isTrunk: false }
    ] as const;

    render(<WorkspaceClient project={baseProject} initialBranches={branches as any} defaultProvider="openai" providerOptions={providerOptions} />);

    // Show shared so we deterministically render rows even when history is identical across refs.
    await user.click(await screen.findByRole('button', { name: /show shared/i }));

    const stripes = await screen.findAllByTestId('chat-row-stripe');
    // We should have at least 2 stripes for the 2 sample nodes (user + assistant).
    expect(stripes.length).toBeGreaterThanOrEqual(2);

    const list = screen.getByTestId('chat-message-list');
    expect(list.className).not.toMatch(/space-y-/);
  });
});
