import React, { act } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BranchSummary, ProjectMetadata, NodeRecord } from '@git/types';
import { WorkspaceClient } from '@/src/components/workspace/WorkspaceClient';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';
import { getDefaultThinkingSetting } from '@/src/shared/llmCapabilities';

type CapturedWorkspaceGraphProps = {
  mode?: 'nodes' | 'collapsed' | 'starred';
  branchHistories?: Record<string, NodeRecord[]>;
  onSelectNode?: (nodeId: string | null) => void;
};

let capturedWorkspaceGraphProps: CapturedWorkspaceGraphProps | null = null;

vi.mock('@/src/components/workspace/WorkspaceGraph', () => ({
  WorkspaceGraph: (props: CapturedWorkspaceGraphProps) => {
    capturedWorkspaceGraphProps = props;
    return <div data-testid="workspace-graph" />;
  }
}));

vi.mock('reactflow', async () => {
  const React = await import('react');
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

vi.mock('@/src/components/auth/AuthRailStatus', () => ({
  AuthRailStatus: () => null
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

const baseBranches: BranchSummary[] = [
  { name: 'main', headCommit: 'abc', nodeCount: 2, isTrunk: true },
  { name: 'feature/phase-2', headCommit: 'def', nodeCount: 2, isTrunk: false }
];

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];
type FetchMock = ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>> & {
  mock: { calls: FetchCall[] };
};

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
  let fetchMock: FetchMock;

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

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('/graph')) {
        return new Response(
          JSON.stringify({
            branches: baseBranches,
            trunkName: 'main',
            currentBranch: baseProject.branchName,
            branchHistories: {
              main: sampleNodes.slice(0, 2),
              'feature/phase-2': sampleNodes.slice(0, 2)
            },
            starredNodeIds: []
          }),
          { status: 200 }
        );
      }
      if (url.includes('/stars')) {
        return new Response(JSON.stringify({ starredNodeIds: [] }), { status: 200 });
      }
      if (url.includes('/history')) {
        const parsedUrl = new URL(url, 'http://localhost');
        const ref = parsedUrl.searchParams.get('ref');
        const limit = parsedUrl.searchParams.get('limit');
        const base = ref === 'main' ? sampleNodes.slice(0, 2) : sampleNodes;
        const nodes = limit ? base.slice(0, Number(limit)) : base;
        return new Response(JSON.stringify({ nodes }), { status: 200 });
      }
      if (url.includes('/branches') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ branchName: 'main', branches: baseBranches }), { status: 200 });
      }
      if (url.includes('/artefact')) {
        return new Response(JSON.stringify({ artefact: '## Artefact state', lastUpdatedAt: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as FetchMock;

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders metadata, nodes, and artefact content', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    expect(screen.getByText('Workspace Project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'feature/phase-2' })).toBeInTheDocument();
    expect(screen.getByText('Test project description')).toBeInTheDocument();

    // Reveal shared history on non-trunk branches before asserting messages.
    await user.click(await screen.findByRole('button', { name: /^show$/i }));

    expect(screen.getByText('How is progress going?')).toBeInTheDocument();
    expect(screen.getByText('All tasks queued.')).toBeInTheDocument();
    expect(screen.getByText('Branch-only follow-up.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^canvas$/i }));
    expect(screen.getByDisplayValue(/## Artefact state/)).toBeInTheDocument();

    // Copy is exposed for every message, while edit is only exposed for user messages by default.
    expect(screen.getAllByRole('button', { name: 'Copy message' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Edit message' })).toHaveLength(2);
  });

  it('renders assistant message content as markdown', async () => {
    mockUseProjectData.mockReturnValue({
      nodes: [
        { id: 'u1', type: 'message', role: 'user', content: 'Hi', timestamp: 1, parent: null },
        { id: 'a1', type: 'message', role: 'assistant', content: 'Hello **world**', timestamp: 2, parent: 'u1' }
      ],
      artefact: '# Artefact',
      artefactMeta: { artefact: '# Artefact', lastUpdatedAt: null },
      isLoading: false,
      error: undefined,
      mutateHistory: vi.fn(),
      mutateArtefact: vi.fn()
    } as unknown as ReturnType<typeof useProjectData>);

    mockUseChatStream.mockReturnValue({
      sendMessage: vi.fn(),
      interrupt: vi.fn(),
      state: { isStreaming: false, error: null }
    } as unknown as ReturnType<typeof useChatStream>);

    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    const bold = await screen.findByText('world');
    expect(bold.tagName).toBe('STRONG');
  });

  it('sends the draft when the user presses ⌘+Enter', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

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

    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    expect(capturedChatOptions).not.toBeNull();

    await act(async () => {
      capturedChatOptions?.onChunk?.({ type: 'text', content: 'partial response' });
    });

    expect(screen.getByText('partial response')).toBeInTheDocument();
  });

  it('refreshes history and artefact when the stream completes', async () => {
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);
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

    // This component re-renders quickly (SWR + effects); keep the mocked history stable across renders.
    mockUseProjectData.mockReturnValue({
      nodes: nodesWithMerge,
      artefact: '## Artefact state',
      artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
      isLoading: false,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    render(
      <WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />
    );

    expect(screen.getByRole('button', { name: 'Add canvas diff to context' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add canvas diff to context' }));
    await user.click(screen.getByRole('button', { name: 'Confirm add canvas diff to context' }));

    await waitFor(() => {
      expect(mutateHistoryMock).toHaveBeenCalled();
    });

    const pinCall = fetchMock.mock.calls.find(
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

    // This component re-renders quickly (SWR + effects); keep the mocked history stable across renders.
    mockUseProjectData.mockReturnValue({
      nodes: nodesWithBranchAssistant,
      artefact: '## Artefact state',
      artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
      isLoading: false,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('/stars')) {
        return new Response(JSON.stringify({ starredNodeIds: [] }), { status: 200 });
      }
      if (url.includes('/history')) {
        const parsedUrl = new URL(url, 'http://localhost');
        const ref = parsedUrl.searchParams.get('ref');
        const limit = parsedUrl.searchParams.get('limit');
        const base = ref === 'main' ? sampleNodes.slice(0, 2) : sampleNodes;
        const nodes = limit ? base.slice(0, Number(limit)) : base;
        return new Response(JSON.stringify({ nodes }), { status: 200 });
      }
      if (url.includes('/branches') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ branchName: 'main', branches: baseBranches }), { status: 200 });
      }
      if (url.includes('/artefact')) {
        return new Response(JSON.stringify({ artefact: '## Artefact state', lastUpdatedAt: null }), { status: 200 });
      }
      if (url.endsWith('/merge')) {
        return new Response(JSON.stringify({ mergeNode: { id: 'merge-1', type: 'merge' } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <WorkspaceClient
        project={baseProject}
        initialBranches={baseBranches}
        defaultProvider="openai"
        providerOptions={providerOptions} openAIUseResponses={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /merge/i }));
    expect(await screen.findByText(/merge summary/i)).toBeInTheDocument();
    expect(screen.getAllByText('Branch final payload.')).toHaveLength(2);

    await user.type(screen.getByLabelText('Merge summary'), 'Bring back the final payload');

    const mergeButtons = screen.getAllByRole('button', { name: /merge/i });
    const confirmButton = mergeButtons[mergeButtons.length - 1];
    await waitFor(() => {
      expect(confirmButton).not.toBeDisabled();
    });
    await user.click(confirmButton);

    const mergeCall = fetchMock.mock.calls.find(
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

    const branchSwitchCall = fetchMock.mock.calls.find(
      ([input, init]: [RequestInfo | URL, RequestInit]) => input.toString().includes('/branches') && init?.method === 'PATCH'
    );
    expect(branchSwitchCall).toBeTruthy();
  });

  it('shows stop controls and error text while streaming', async () => {
    chatState.isStreaming = true;
    chatState.error = 'Network issue';
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    expect(screen.getByLabelText('Stop streaming')).toBeInTheDocument();
    expect(screen.getByText('Network issue')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Stop streaming' }));

    expect(interruptMock).toHaveBeenCalledTimes(1);
  });

  it('renders loading and error states from the history hook', async () => {
    // This component re-renders quickly (SWR + effects); keep the mocked state stable across renders.
    let currentProjectData: ReturnType<typeof useProjectData> = {
      nodes: [],
      artefact: '',
      artefactMeta: null,
      isLoading: true,
      error: undefined,
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>;

    mockUseProjectData.mockImplementation(() => currentProjectData);

    const { rerender } = render(
      <WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />
    );
    await waitFor(() => {
      expect(screen.getByText('Loading history…')).toBeInTheDocument();
    });

    currentProjectData = {
      nodes: [],
      artefact: '',
      artefactMeta: null,
      isLoading: false,
      error: new Error('boom'),
      mutateHistory: mutateHistoryMock,
      mutateArtefact: mutateArtefactMock
    } as ReturnType<typeof useProjectData>;

    rerender(
      <WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />
    );
    await waitFor(() => {
      expect(screen.getByText('Failed to load history.')).toBeInTheDocument();
    });
  });

  it('uses the branch provider for chat streaming', async () => {
    const branches: BranchSummary[] = [
      { name: 'main', headCommit: 'abc', nodeCount: 2, isTrunk: true, provider: 'openai', model: 'gpt-5.2' },
      { name: 'feature/phase-2', headCommit: 'def', nodeCount: 2, isTrunk: false, provider: 'gemini', model: 'gemini-3.0-pro' }
    ];
    render(<WorkspaceClient project={baseProject} initialBranches={branches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);
    await waitFor(() => {
      expect(capturedChatOptions?.provider).toBe('gemini');
    });
  });

  it('renders assistant messages with a wider bubble', async () => {
    render(
      <WorkspaceClient
        project={{ ...baseProject, branchName: 'main' }}
        initialBranches={baseBranches}
        defaultProvider="openai"
        providerOptions={providerOptions} openAIUseResponses={false}
      />
    );
    await waitFor(() => {
      const assistantMessage = screen.getByText('All tasks queued.');
      const bubble = assistantMessage.closest('article')?.querySelector('div');
      expect(bubble?.className).toContain('max-w-[85%]');
    });
  });

  it('keeps provider/thinking pinned to branch when switching branches', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('researchtree:thinking:proj-1:feature/phase-2', 'high');
    window.localStorage.setItem('researchtree:thinking:proj-1:main', 'medium');
    const branches: BranchSummary[] = [
      { name: 'main', headCommit: 'abc', nodeCount: 2, isTrunk: true, provider: 'openai', model: 'gpt-5.2' },
      { name: 'feature/phase-2', headCommit: 'def', nodeCount: 2, isTrunk: false, provider: 'gemini', model: 'gemini-3.0-pro' }
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          branchName: 'main',
          branches
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    try {
      render(<WorkspaceClient project={baseProject} initialBranches={branches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

      await waitFor(() => {
        const badge = screen.getByText('Provider').parentElement;
        expect(badge).toHaveTextContent('Gemini');
      });

      await user.click(screen.getByRole('button', { name: 'trunk' }));

      await waitFor(() => {
        const badge = screen.getByText('Provider').parentElement;
        expect(badge).toHaveTextContent('OpenAI');
      });

      expect(window.localStorage.getItem('researchtree:thinking:proj-1:feature/phase-2')).toBe(
        getDefaultThinkingSetting('gemini', 'gemini-3.0-pro')
      );
      expect(window.localStorage.getItem('researchtree:thinking:proj-1:main')).toBe(
        getDefaultThinkingSetting('openai', 'gpt-5.2')
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('updates and persists the thinking mode selection', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

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
      <WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />
    );

    await user.click(screen.getByRole('button', { name: /thred graph/i }));

    await waitFor(() => {
      expect(capturedWorkspaceGraphProps).not.toBeNull();
      expect(capturedWorkspaceGraphProps.mode).toBe('collapsed');
      // Loaded graph histories include multiple branches (not just the fallback active-branch history).
      expect(capturedWorkspaceGraphProps.branchHistories?.main?.length).toBeGreaterThan(0);
      // Active branch history initially comes from the graph payload; it updates when the active history changes.
      expect(capturedWorkspaceGraphProps.branchHistories?.['feature/phase-2']?.length).toBe(2);
    });

    currentNodes = [...currentNodes, { id: 'node-3', type: 'message', role: 'assistant', content: 'New node', timestamp: 1700000002000, parent: 'node-assistant' }];
    rerender(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    await waitFor(() => {
      expect(capturedWorkspaceGraphProps.branchHistories?.['feature/phase-2']?.length).toBe(4);
    });
  });

  it('scrolls to the bottom when switching branches', async () => {
    const user = userEvent.setup();
    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    const list = await screen.findByTestId('chat-message-list');
    const listEl = list as HTMLElement & { scrollTop: number };
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true, configurable: true });

    // requestAnimationFrame is used for the scroll; make it immediate for the test.
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as unknown as typeof globalThis.requestAnimationFrame;

    await user.click(screen.getByRole('button', { name: 'trunk' }));

    await waitFor(() => {
      expect(listEl.scrollTop).toBe(2000);
    });

    globalThis.requestAnimationFrame = raf;
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
      <WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />
    );

    await user.click(await screen.findByRole('button', { name: /^show$/i }));

    const list = await screen.findByTestId('chat-message-list');
    const listEl = list as HTMLElement & { scrollTop: number };
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 2000, writable: true, configurable: true });

    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as unknown as typeof globalThis.requestAnimationFrame;

    Object.defineProperty(list, 'scrollHeight', { value: 3000, configurable: true });
    currentNodes = [
      ...currentNodes,
      { id: 'node-new', type: 'message', role: 'assistant', content: 'Newest node', timestamp: 1700000003000, parent: 'node-user-branch' }
    ];
    rerender(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    await waitFor(() => {
      expect(listEl.scrollTop).toBe(3000);
    });

    globalThis.requestAnimationFrame = raf;
  });

  it('renders a stripe for every visible node row (including user and assistant)', async () => {
    const user = userEvent.setup();
    const branches: BranchSummary[] = [
      { name: 'main', headCommit: 'abc', nodeCount: 1, isTrunk: true },
      { name: 'feature/phase-2', headCommit: 'def', nodeCount: 2, isTrunk: false }
    ];

    render(<WorkspaceClient project={baseProject} initialBranches={branches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    // Show shared so we deterministically render rows even when history is identical across refs.
    await user.click(await screen.findByRole('button', { name: /^show$/i }));

    const stripes = await screen.findAllByTestId('chat-row-stripe');
    // We should have at least 2 stripes for the 2 sample nodes (user + assistant).
    expect(stripes.length).toBeGreaterThanOrEqual(2);

    const list = screen.getByTestId('chat-message-list');
    expect(list.className).not.toMatch(/space-y-/);
  });

  it('jumps to a shared node by revealing shared history and scrolling it into view', async () => {
    const user = userEvent.setup();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewMock = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as unknown as typeof globalThis.requestAnimationFrame;

    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    // Default on non-trunk branches is to hide shared history.
    expect(screen.queryByText('How is progress going?')).not.toBeInTheDocument();
    expect(screen.getByText('Branch-only follow-up.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /thred graph/i }));
    await waitFor(() => {
      expect(capturedWorkspaceGraphProps).not.toBeNull();
    });

    await act(async () => {
      capturedWorkspaceGraphProps?.onSelectNode?.('node-user');
    });

    expect(screen.getByRole('button', { name: 'Jump to message' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Jump to message' })).not.toBeInTheDocument();

    await act(async () => {
      capturedWorkspaceGraphProps?.onSelectNode?.('node-user');
    });
    await user.click(screen.getByRole('button', { name: 'Jump to message' }));

    await waitFor(() => {
      const list = screen.getByTestId('chat-message-list');
      expect(within(list).getByText('How is progress going?')).toBeInTheDocument();
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    globalThis.requestAnimationFrame = raf;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('jumps to a node on another branch by switching branches first', async () => {
    const user = userEvent.setup();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewMock = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as unknown as typeof globalThis.requestAnimationFrame;

    const branches: BranchSummary[] = [
      { name: 'main', headCommit: 'abc', nodeCount: 2, isTrunk: true },
      { name: 'feature/phase-2', headCommit: 'def', nodeCount: 3, isTrunk: false },
      { name: 'feature/other', headCommit: 'ghi', nodeCount: 2, isTrunk: false }
    ];

    const otherNodes: NodeRecord[] = [
      {
        id: 'other-1',
        type: 'message',
        role: 'user',
        content: 'Other branch node',
        timestamp: 1700000000000,
        parent: null
      },
      {
        id: 'other-2',
        type: 'message',
        role: 'assistant',
        content: 'Other branch response',
        timestamp: 1700000001000,
        parent: 'other-1'
      }
    ];

    mockUseProjectData.mockImplementation((_projectId, options) => {
      if (options?.ref === 'feature/other') {
        return {
          nodes: otherNodes,
          artefact: '## Other artefact',
          artefactMeta: { artefact: '## Other artefact', lastUpdatedAt: null },
          isLoading: false,
          error: undefined,
          mutateHistory: mutateHistoryMock,
          mutateArtefact: mutateArtefactMock
        } as ReturnType<typeof useProjectData>;
      }
      return {
        nodes: sampleNodes,
        artefact: '## Artefact state',
        artefactMeta: { artefact: '## Artefact state', lastUpdatedAt: null },
        isLoading: false,
        error: undefined,
        mutateHistory: mutateHistoryMock,
        mutateArtefact: mutateArtefactMock
      } as ReturnType<typeof useProjectData>;
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('/graph')) {
        return new Response(
          JSON.stringify({
            branches,
            trunkName: 'main',
            currentBranch: 'feature/phase-2',
            branchHistories: {
              main: sampleNodes.slice(0, 2),
              'feature/phase-2': sampleNodes,
              'feature/other': otherNodes
            },
            starredNodeIds: []
          }),
          { status: 200 }
        );
      }
      if (url.includes('/stars')) {
        return new Response(JSON.stringify({ starredNodeIds: [] }), { status: 200 });
      }
      if (url.includes('/history')) {
        const parsedUrl = new URL(url, 'http://localhost');
        const ref = parsedUrl.searchParams.get('ref');
        if (ref === 'feature/other') {
          return new Response(JSON.stringify({ nodes: otherNodes }), { status: 200 });
        }
        const base = ref === 'main' ? sampleNodes.slice(0, 2) : sampleNodes;
        return new Response(JSON.stringify({ nodes: base }), { status: 200 });
      }
      if (url.includes('/branches') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ branchName: 'feature/other', branches }), { status: 200 });
      }
      if (url.includes('/artefact')) {
        return new Response(JSON.stringify({ artefact: '## Artefact state', lastUpdatedAt: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<WorkspaceClient project={baseProject} initialBranches={branches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    await user.click(screen.getByRole('button', { name: /thred graph/i }));
    await waitFor(() => {
      expect(capturedWorkspaceGraphProps).not.toBeNull();
    });

    await act(async () => {
      capturedWorkspaceGraphProps?.onSelectNode?.('other-1');
    });

    await user.click(screen.getByRole('button', { name: 'Jump to message' }));

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
      const list = screen.getByTestId('chat-message-list');
      expect(within(list).getByText('Other branch node')).toBeInTheDocument();
    });

    const branchPatchCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/branches') && call[1]?.method === 'PATCH');
    expect(branchPatchCall).toBeTruthy();
    expect(JSON.parse(branchPatchCall[1].body)).toMatchObject({ name: 'feature/other' });

    globalThis.requestAnimationFrame = raf;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('can add canvas changes to chat from a merge node selected in the graph', async () => {
    const user = userEvent.setup();

    const mergeNode: NodeRecord = {
      id: 'merge-1',
      type: 'merge',
      mergeFrom: 'feature/phase-2',
      mergeSummary: 'Bring back the canvas edits',
      sourceCommit: 'abc',
      sourceNodeIds: ['node-user', 'node-assistant'],
      canvasDiff: '+hello',
      mergedAssistantContent: 'Here are the takeaways',
      timestamp: 1700000003000,
      parent: 'node-assistant'
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('/graph')) {
        return new Response(
          JSON.stringify({
            branches: baseBranches,
            trunkName: 'main',
            currentBranch: baseProject.branchName,
            branchHistories: {
              main: [...sampleNodes.slice(0, 2), mergeNode],
              'feature/phase-2': sampleNodes
            },
            starredNodeIds: []
          }),
          { status: 200 }
        );
      }
      if (url.includes('/merge/pin-canvas-diff')) {
        return new Response(
          JSON.stringify({
            pinnedNode: {
              id: 'pinned-1',
              type: 'message',
              role: 'assistant',
              content: '+hello',
              pinnedFromMergeId: 'merge-1',
              timestamp: 1700000004000,
              parent: 'merge-1'
            }
          }),
          { status: 200 }
        );
      }
      if (url.includes('/stars')) {
        return new Response(JSON.stringify({ starredNodeIds: [] }), { status: 200 });
      }
      if (url.includes('/history')) {
        return new Response(JSON.stringify({ nodes: sampleNodes }), { status: 200 });
      }
      if (url.includes('/artefact')) {
        return new Response(JSON.stringify({ artefact: '## Artefact state', lastUpdatedAt: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    await user.click(screen.getByRole('button', { name: /thred graph/i }));
    await waitFor(() => {
      expect(capturedWorkspaceGraphProps).not.toBeNull();
    });

    await act(async () => {
      capturedWorkspaceGraphProps?.onSelectNode?.('merge-1');
    });

    await user.click(screen.getByRole('button', { name: 'Add canvas changes to chat' }));
    await user.click(screen.getByRole('button', { name: 'Confirm add canvas changes to chat' }));

    await waitFor(() => {
      expect(screen.getByText('Canvas changes added')).toBeInTheDocument();
    });

    const pinCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/merge/pin-canvas-diff'));
    expect(pinCall).toBeTruthy();
    expect(JSON.parse(pinCall[1].body)).toMatchObject({ mergeNodeId: 'merge-1', targetBranch: 'main' });
  });

  it('copies the selected node content from the graph detail panel', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<WorkspaceClient project={baseProject} initialBranches={baseBranches} defaultProvider="openai" providerOptions={providerOptions} openAIUseResponses={false} />);

    await user.click(screen.getByRole('button', { name: /thred graph/i }));
    await waitFor(() => {
      expect(capturedWorkspaceGraphProps).not.toBeNull();
    });

    await act(async () => {
      capturedWorkspaceGraphProps?.onSelectNode?.('node-user');
    });

    await user.click(screen.getByRole('button', { name: 'Copy selection' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('How is progress going?');
    });
  });
});
