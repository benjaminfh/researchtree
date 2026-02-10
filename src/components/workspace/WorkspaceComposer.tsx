// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { CommandEnterForm } from '@/src/components/forms/CommandEnterForm';
import { BlueprintIcon } from '@/src/components/ui/BlueprintIcon';
import { CHAT_COMPOSER_DEFAULT_LINES } from '@/src/config/app';
import { CHAT_LIMITS } from '@/src/shared/chatLimits';
import { THINKING_SETTING_LABELS, type ThinkingSetting } from '@/src/shared/thinking';
import { ArrowUpIcon, XMarkIcon } from './HeroIcons';

const CHAT_COMPOSER_MAX_LINES = 9;
const HTML_TAG_DETECTION_REGEX = /<([a-z][\s\S]*?)>/i;

const formatCharLimitMessage = (label: string, current: number, max: number) => {
  return `${label} is too long (${current} chars). Max ${max} characters.`;
};

export type WorkspaceComposerHandle = {
  appendQuotedText: (messageText: string) => void;
  appendTextAndFocus: (value: string) => void;
  setDraftAndFocus: (value: string) => void;
};

type WorkspaceComposerProps = {
  railCollapsed: boolean;
  draftStorageKey: string;
  isInputDisabled: boolean;
  isActionDisabled: boolean;
  isStreaming: boolean;
  isSending: boolean;
  thinkingUnsupportedError: string | null;
  webSearchAvailable: boolean;
  webSearchEnabled: boolean;
  showOpenAISearchNote: boolean;
  thinking: ThinkingSetting;
  allowedThinking: ThinkingSetting[];
  onSubmitDraft: (draft: string) => Promise<boolean>;
  onInterrupt: () => void;
  onThinkingChange: (next: ThinkingSetting) => void;
  onWebSearchToggle: () => void;
  onComposerErrorChange: (value: string | null) => void;
  onComposerPaddingChange: (value: number) => void;
  pushToast: (tone: 'info' | 'success' | 'error', message: string) => void;
  convertHtmlToMarkdown: (value: string) => string;
};

export const WorkspaceComposer = forwardRef<WorkspaceComposerHandle, WorkspaceComposerProps>(function WorkspaceComposer(
  {
    railCollapsed,
    draftStorageKey,
    isInputDisabled,
    isActionDisabled,
    isStreaming,
    isSending,
    thinkingUnsupportedError,
    webSearchAvailable,
    webSearchEnabled,
    showOpenAISearchNote,
    thinking,
    allowedThinking,
    onSubmitDraft,
    onInterrupt,
    onThinkingChange,
    onWebSearchToggle,
    onComposerErrorChange,
    onComposerPaddingChange,
    pushToast,
    convertHtmlToMarkdown
  },
  ref
) {
  const [draft, setDraft] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerCornerRadius, setComposerCornerRadius] = useState<number | null>(null);
  const [composerMinHeight, setComposerMinHeight] = useState<number | null>(null);
  const [composerMaxHeight, setComposerMaxHeight] = useState<number | null>(null);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [utilitiesMenuOpen, setUtilitiesMenuOpen] = useState(false);

  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composerBasePaddingRef = useRef<number>(128);
  const composerCornerRadiusRef = useRef<number | null>(null);
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null);
  const utilitiesMenuRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    appendQuotedText(messageText: string) {
      const normalized = messageText.replace(/\r\n/g, '\n');
      const quoted = normalized
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
      const quotedBlock = `${quoted}\n\n`;
      setDraft((prev) => (prev ? `${prev}\n\n${quotedBlock}` : quotedBlock));
      window.setTimeout(() => {
        const input = composerTextareaRef.current;
        if (!input) return;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
        const isBeyondView = input.scrollTop + input.clientHeight < input.scrollHeight;
        if (isBeyondView) {
          input.scrollTop = input.scrollHeight;
        }
      }, 0);
    },
    appendTextAndFocus(value: string) {
      setDraft((prev) => `${prev}${value}`);
      window.setTimeout(() => {
        const input = composerTextareaRef.current;
        if (!input) return;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }, 0);
    },
    setDraftAndFocus(value: string) {
      setDraft(value);
      window.setTimeout(() => {
        const input = composerTextareaRef.current;
        if (!input) return;
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }, 0);
    }
  }));

  const resizeComposer = useCallback(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const minHeight = composerMinHeight ?? scrollHeight;
    const maxHeight = composerMaxHeight ?? scrollHeight;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, [composerMaxHeight, composerMinHeight]);

  const updateComposerMetrics = useCallback(() => {
    if (typeof window === 'undefined') return;
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight || '');
    const paddingTop = Number.parseFloat(styles.paddingTop || '0');
    const paddingBottom = Number.parseFloat(styles.paddingBottom || '0');
    if (!Number.isFinite(lineHeight)) return;
    setComposerMinHeight(lineHeight * CHAT_COMPOSER_DEFAULT_LINES + paddingTop + paddingBottom);
    setComposerMaxHeight(lineHeight * CHAT_COMPOSER_MAX_LINES + paddingTop + paddingBottom);
  }, []);

  const updateComposerCornerRadius = useCallback(() => {
    const composer = composerRef.current;
    const textarea = composerTextareaRef.current;
    if (!composer || !textarea) return;
    const minHeight = composerMinHeight;
    if (!minHeight) return;
    const composerHeight = composer.getBoundingClientRect().height;
    const textareaHeight = textarea.getBoundingClientRect().height;
    const delta = Math.max(0, composerHeight - textareaHeight);
    const baseHeight = minHeight + delta;
    const nextRadius = Math.ceil(baseHeight / 2);
    if (composerCornerRadiusRef.current === nextRadius) return;
    composerCornerRadiusRef.current = nextRadius;
    setComposerCornerRadius(nextRadius);
  }, [composerMinHeight]);

  const updateBaseComposerPadding = useCallback(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const next = Math.max(116, Math.ceil(composer.offsetHeight + 24));
    if (composerBasePaddingRef.current === next) return;
    composerBasePaddingRef.current = next;
  }, []);

  useLayoutEffect(() => {
    updateComposerMetrics();
  }, [updateComposerMetrics]);

  useLayoutEffect(() => {
    resizeComposer();
  }, [draft, resizeComposer]);

  useLayoutEffect(() => {
    updateComposerCornerRadius();
  }, [draft, updateComposerCornerRadius]);

  useEffect(() => {
    onComposerErrorChange(composerError);
  }, [composerError, onComposerErrorChange]);

  useEffect(() => {
    if (!composerError) return;
    if (draft.length <= CHAT_LIMITS.messageMaxChars) {
      setComposerError(null);
    }
  }, [composerError, draft]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedDraft = window.sessionStorage.getItem(draftStorageKey);
    if (savedDraft) {
      setDraft(savedDraft);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draft) {
      window.sessionStorage.removeItem(draftStorageKey);
    } else {
      window.sessionStorage.setItem(draftStorageKey, draft);
    }
  }, [draft, draftStorageKey]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer || typeof ResizeObserver === 'undefined') {
      updateBaseComposerPadding();
      return;
    }
    const updatePadding = () => {
      if (!draft.trim()) {
        updateBaseComposerPadding();
        onComposerPaddingChange(composerBasePaddingRef.current);
        return;
      }
      onComposerPaddingChange(composerBasePaddingRef.current);
    };
    updatePadding();
    const observer = new ResizeObserver(updatePadding);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [draft, onComposerPaddingChange, updateBaseComposerPadding]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      updateComposerMetrics();
      resizeComposer();
      updateComposerCornerRadius();
      updateBaseComposerPadding();
      onComposerPaddingChange(composerBasePaddingRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [onComposerPaddingChange, resizeComposer, updateBaseComposerPadding, updateComposerCornerRadius, updateComposerMetrics]);

  useEffect(() => {
    if (!thinkingMenuOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const container = thinkingMenuRef.current;
      const target = event.target;
      if (!container || !(target instanceof Node)) return;
      if (!container.contains(target)) {
        setThinkingMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setThinkingMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [thinkingMenuOpen]);

  useEffect(() => {
    if (!utilitiesMenuOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const container = utilitiesMenuRef.current;
      const target = event.target;
      if (!container || !(target instanceof Node)) return;
      if (!container.contains(target)) {
        setUtilitiesMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUtilitiesMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [utilitiesMenuOpen]);

  const submitDisabled = isActionDisabled || !draft.trim() || Boolean(thinkingUnsupportedError);

  const handleSubmit = useCallback(async () => {
    if (!draft.trim() || isStreaming) return;
    if (draft.length > CHAT_LIMITS.messageMaxChars) {
      setComposerError(formatCharLimitMessage('Message', draft.length, CHAT_LIMITS.messageMaxChars));
      return;
    }
    setComposerError(null);
    const submittedDraft = draft;
    setDraft('');
    setUtilitiesMenuOpen(false);
    const sent = await onSubmitDraft(submittedDraft);
    if (!sent) {
      setDraft(submittedDraft);
    }
  }, [draft, isStreaming, onSubmitDraft]);

  const handleHtmlToMarkdown = useCallback(() => {
    if (isActionDisabled) return;
    const htmlCandidate = draft.trim();
    if (!htmlCandidate) {
      pushToast('error', 'Composer is empty.');
      setUtilitiesMenuOpen(false);
      return;
    }
    if (!HTML_TAG_DETECTION_REGEX.test(htmlCandidate)) {
      pushToast('error', 'No HTML detected to convert.');
      setUtilitiesMenuOpen(false);
      return;
    }
    try {
      const converted = convertHtmlToMarkdown(htmlCandidate);
      if (!converted.trim()) {
        throw new Error('empty-conversion');
      }
      setDraft(converted);
    } catch (error) {
      console.error('Failed to convert HTML to markdown.', error);
      pushToast('error', 'Unable to convert HTML to markdown.');
    } finally {
      setUtilitiesMenuOpen(false);
    }
  }, [convertHtmlToMarkdown, draft, isActionDisabled, pushToast]);

  const thinkingLabel = useMemo(() => THINKING_SETTING_LABELS[thinking], [thinking]);

  return (
    <CommandEnterForm
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
      className="pointer-events-none fixed inset-x-0 bottom-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div
        className="pointer-events-auto mx-auto max-w-6xl px-4 md:pr-12"
        style={{ paddingLeft: railCollapsed ? '72px' : '320px' }}
      >
        <div
          ref={composerRef}
          className="flex items-stretch gap-2 border border-divider bg-white px-3 py-2 shadow-composer"
          style={{ borderRadius: composerCornerRadius ? `${composerCornerRadius}px` : '9999px' }}
        >
          <div className="flex items-center gap-2">
            <div ref={utilitiesMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (isActionDisabled) return;
                  setUtilitiesMenuOpen((prev) => !prev);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-divider/80 bg-white text-xs font-semibold leading-none text-slate-700 transition hover:bg-primary/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Utilities"
                title="Utilities"
                aria-haspopup="menu"
                aria-expanded={utilitiesMenuOpen}
                disabled={isActionDisabled}
              >
                <BlueprintIcon icon="plus" className="h-4 w-4" />
              </button>
              {utilitiesMenuOpen ? (
                <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-divider bg-white p-1 shadow-lg">
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Utilities</div>
                  <button
                    type="button"
                    role="menuitem"
                    title="HTML to markdown"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleHtmlToMarkdown}
                    disabled={isActionDisabled}
                  >
                    <span className="flex items-center gap-2">
                      <BlueprintIcon icon="code" className="h-3.5 w-3.5" />
                      HTML to markdown
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={webSearchEnabled}
                    title="Web search"
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      webSearchEnabled ? 'bg-primary/10 text-primary' : 'text-slate-700 hover:bg-primary/10'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    onClick={() => {
                      if (!webSearchAvailable || isStreaming) return;
                      onWebSearchToggle();
                      setUtilitiesMenuOpen(false);
                    }}
                    disabled={isActionDisabled || !webSearchAvailable}
                  >
                    <span className="flex items-center gap-2">
                      <BlueprintIcon icon="globe-network" className="h-3.5 w-3.5" />
                      Web search
                    </span>
                    {webSearchEnabled ? <span aria-hidden="true">✓</span> : null}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="relative flex flex-1 items-center">
            <textarea
              ref={composerTextareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask anything"
              rows={CHAT_COMPOSER_DEFAULT_LINES}
              className="flex-1 w-full resize-none overflow-y-auto rounded-lg border border-slate-200/80 bg-white/70 px-3 pb-6 pt-1.5 text-base leading-relaxed placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:outline-none"
              style={{
                minHeight: composerMinHeight ? `${composerMinHeight}px` : undefined,
                maxHeight: composerMaxHeight ? `${composerMaxHeight}px` : undefined
              }}
              disabled={isInputDisabled}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                if (event.metaKey) {
                  event.preventDefault();
                  void handleSubmit();
                  return;
                }
                if (event.shiftKey || event.altKey) return;
              }}
            />
            <div className="pointer-events-none absolute inset-x-3 bottom-1 flex items-center text-[11px] text-slate-400">
              <span className="flex-1 text-left">{showOpenAISearchNote ? 'Search uses gpt-4o-mini-search-preview.' : ''}</span>
              <span className={`flex-[2] whitespace-nowrap text-center ${draft.length > 0 ? 'opacity-10' : ''}`}>
                ⌘ + Enter to send · Shift + Enter adds a newline.
              </span>
              <span className={`flex-1 text-right ${isStreaming ? 'animate-pulse text-primary' : ''}`}>{isStreaming ? 'Streaming…' : ''}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div ref={thinkingMenuRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setThinkingMenuOpen((prev) => !prev)}
                className="inline-flex h-9 items-center gap-1 rounded-full bg-slate-100 px-3 py-0 text-xs font-semibold leading-none text-slate-700 transition hover:bg-slate-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Thinking mode"
                title="Thinking level"
                aria-haspopup="menu"
                aria-expanded={thinkingMenuOpen}
                disabled={isStreaming}
              >
                {thinkingLabel} ▾
              </button>
              {thinkingMenuOpen ? (
                <div role="menu" className="absolute bottom-full right-0 z-50 mb-2 w-26 rounded-xl border border-divider bg-white p-1 shadow-lg">
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Thinking level</div>
                  {allowedThinking.map((setting) => {
                    const active = thinking === setting;
                    return (
                      <button
                        key={setting}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        disabled={isStreaming}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                          active ? 'bg-primary/10 text-primary' : 'text-slate-700 hover:bg-primary/10'
                        }`}
                        onClick={() => {
                          if (isStreaming) return;
                          onThinkingChange(setting);
                          setThinkingMenuOpen(false);
                        }}
                      >
                        <span>{THINKING_SETTING_LABELS[setting]}</span>
                        {active ? <span aria-hidden="true">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {isStreaming ? (
              <button
                type="button"
                onClick={onInterrupt}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 shadow-sm transition hover:bg-red-100 focus:outline-none"
                aria-label="Stop streaming"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={submitDisabled}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Send message"
            >
              {isSending ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
              ) : (
                <ArrowUpIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </CommandEnterForm>
  );
});
