import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceComposer } from '@/src/components/workspace/WorkspaceComposer';
import { CHAT_LIMITS } from '@/src/shared/chatLimits';

const baseProps = {
  collapsed: false,
  railCollapsed: false,
  draftStorageKey: 'researchtree:draft:test-proj',
  initialDraft: null,
  inputDisabled: false,
  actionDisabled: false,
  isStreaming: false,
  isSending: false,
  canSubmit: true,
  thinking: 'medium' as const,
  allowedThinking: ['none', 'low', 'medium', 'high'] as const,
  thinkingUnsupportedError: null,
  webSearchEnabled: false,
  webSearchAvailable: true,
  showOpenAISearchNote: false,
  maxLines: 9,
  onSend: vi.fn(async () => true),
  onInterrupt: vi.fn(),
  onThinkingChange: vi.fn(),
  onToggleWebSearch: vi.fn(),
  onConvertHtmlToMarkdown: vi.fn(() => null),
  onDraftPresenceChange: vi.fn(),
  onDraftLengthValidChange: vi.fn(),
  onFocusRequestId: null,
  onHeightChange: vi.fn()
};

describe('WorkspaceComposer', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('appends initialDraft to hydrated session draft', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(baseProps.draftStorageKey, 'Existing draft body');

    const { rerender } = render(<WorkspaceComposer {...baseProps} />);

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement).value).toBe('Existing draft body');
    });

    rerender(
      <WorkspaceComposer
        {...baseProps}
        initialDraft={{ id: 'quote-1', value: '> quoted text\n\n', mode: 'append' }}
      />
    );

    await waitFor(() => {
      const composer = screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement;
      expect(composer.value).toContain('Existing draft body');
      expect(composer.value).toContain('> quoted text');
    });

  });

  it('does not overwrite active draft when restore initialDraft arrives', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WorkspaceComposer {...baseProps} />);

    const composer = screen.getByPlaceholderText('Ask anything');
    await user.type(composer, 'Current unsaved text');

    rerender(
      <WorkspaceComposer
        {...baseProps}
        initialDraft={{ id: 'restore-1', value: 'Recovered sent prompt', mode: 'restore' }}
      />
    );

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement).value).toBe('Current unsaved text');
    });
  });


  it('emits draft length validity changes as user edits', async () => {
    const user = userEvent.setup();
    const onDraftLengthValidChange = vi.fn();

    render(<WorkspaceComposer {...baseProps} onDraftLengthValidChange={onDraftLengthValidChange} />);

    const composer = screen.getByPlaceholderText('Ask anything');
    fireEvent.change(composer, { target: { value: 'x'.repeat(CHAT_LIMITS.messageMaxChars + 1) } });

    await waitFor(() => {
      expect(onDraftLengthValidChange).toHaveBeenCalledWith(false);
    });

    await user.clear(composer);
    await user.type(composer, 'ok');

    await waitFor(() => {
      expect(onDraftLengthValidChange).toHaveBeenCalledWith(true);
    });
  });


  it('recomputes composer padding when reopening from collapsed with existing draft', async () => {
    const onHeightChange = vi.fn();
    const { rerender } = render(
      <WorkspaceComposer
        {...baseProps}
        initialDraft={{ id: 'seed', value: 'draft text', mode: 'restore' }}
        onHeightChange={onHeightChange}
      />
    );

    await waitFor(() => {
      expect(onHeightChange).toHaveBeenCalled();
    });

    rerender(
      <WorkspaceComposer
        {...baseProps}
        collapsed
        initialDraft={{ id: 'seed', value: 'draft text', mode: 'restore' }}
        onHeightChange={onHeightChange}
      />
    );

    onHeightChange.mockClear();

    rerender(
      <WorkspaceComposer
        {...baseProps}
        collapsed={false}
        initialDraft={{ id: 'seed', value: 'draft text', mode: 'restore' }}
        onHeightChange={onHeightChange}
      />
    );

    await waitFor(() => {
      expect(onHeightChange).toHaveBeenCalled();
    });
  });

  it('does not clear newer draft text typed while send is in flight', async () => {
    const user = userEvent.setup();
    let resolveSend: ((value: boolean) => void) | null = null;
    const onSend = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSend = resolve;
        })
    );

    render(<WorkspaceComposer {...baseProps} onSend={onSend} />);

    const composer = screen.getByPlaceholderText('Ask anything');
    await user.type(composer, 'First prompt');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('First prompt');
      expect((screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement).value).toBe('');
    });

    await user.type(screen.getByPlaceholderText('Ask anything'), 'Follow-up draft');
    resolveSend?.(true);

    await waitFor(() => {
      expect((screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement).value).toBe('Follow-up draft');
    });
  });

  it('restores original message if send fails and user has not typed a new draft', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn(async () => false);

    render(<WorkspaceComposer {...baseProps} onSend={onSend} />);

    const composer = screen.getByPlaceholderText('Ask anything');
    await user.type(composer, 'Retry me');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith('Retry me');
      expect((screen.getByPlaceholderText('Ask anything') as HTMLTextAreaElement).value).toBe('Retry me');
    });
  });
});
