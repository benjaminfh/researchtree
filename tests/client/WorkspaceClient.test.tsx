import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProjectMetadata, NodeRecord } from '@git/types';
import { WorkspaceClient } from '@/src/components/workspace/WorkspaceClient';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';

vi.mock('@/src/components/workspace/WorkspaceGraph', () => ({
  WorkspaceGraph: () => <div data-testid="workspace-graph" />
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

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/stars')) {
        return new Response(JSON.stringify({ starredNodeIds: [] }), { status: 200 });
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
    // Active branch chip shows branch name
    expect(screen.getByText(/Active ·\s+feature\/phase-2/)).toBeInTheDocument();
    expect(screen.getByText('Test project description')).toBeInTheDocument();

    // Reveal shared history on non-trunk branches before asserting messages.
    const showShared = screen.queryByRole('button', { name: /show shared/i });
    if (showShared) {
      await user.click(showShared);
    }

    expect(screen.getByText('How is progress going?')).toBeInTheDocument();
    expect(screen.getByText('All tasks queued.')).toBeInTheDocument();
    expect(screen.getByText('Artefact state')).toBeInTheDocument();
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
});
