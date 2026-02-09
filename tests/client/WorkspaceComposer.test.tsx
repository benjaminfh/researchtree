import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceComposer } from '@/src/components/workspace/WorkspaceComposer';

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
});
