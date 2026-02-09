// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BlueprintIcon } from '@/src/components/ui/BlueprintIcon';
import { CHAT_COMPOSER_DEFAULT_LINES } from '@/src/config/app';
import { CHAT_LIMITS } from '@/src/shared/chatLimits';
import { THINKING_SETTING_LABELS, type ThinkingSetting } from '@/src/shared/thinking';
import { ArrowUpIcon, XMarkIcon } from './HeroIcons';

type WorkspaceComposerProps = {
  collapsed: boolean;
  railCollapsed: boolean;
  draftStorageKey: string;
  initialDraft: { id: string; value: string; mode: 'append' | 'restore' } | null;
  inputDisabled: boolean;
  actionDisabled: boolean;
  isStreaming: boolean;
  isSending: boolean;
  canSubmit: boolean;
  thinking: ThinkingSetting;
  allowedThinking: ThinkingSetting[];
  thinkingUnsupportedError: string | null;
  webSearchEnabled: boolean;
  webSearchAvailable: boolean;
  showOpenAISearchNote: boolean;
  maxLines: number;
  onSend: (draft: string) => Promise<boolean>;
  onInterrupt: () => void;
  onThinkingChange: (next: ThinkingSetting) => void;
  onToggleWebSearch: () => void;
  onConvertHtmlToMarkdown: (draft: string) => string | null;
  onDraftPresenceChange: (hasDraft: boolean) => void;
  onHeightChange: (height: number) => void;
};

const HTML_TAG_DETECTION_REGEX = /<([a-z][\s\S]*?)>/i;

export const WorkspaceComposer = memo(function WorkspaceComposer({
  collapsed,
  railCollapsed,
  draftStorageKey,
  initialDraft,
  inputDisabled,
  actionDisabled,
  isStreaming,
  isSending,
  canSubmit,
  thinking,
  allowedThinking,
  thinkingUnsupportedError,
  webSearchEnabled,
  webSearchAvailable,
  showOpenAISearchNote,
  maxLines,
  onSend,
  onInterrupt,
  onThinkingChange,
  onToggleWebSearch,
  onConvertHtmlToMarkdown,
  onDraftPresenceChange,
  onHeightChange
}: WorkspaceComposerProps) {
  const [draft, setDraft] = useState('');
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [utilitiesMenuOpen, setUtilitiesMenuOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [minHeight, setMinHeight] = useState<number | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [cornerRadius, setCornerRadius] = useState<number | null>(null);
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null);
  const utilitiesMenuRef = useRef<HTMLDivElement | null>(null);
  const lastHasDraftRef = useRef<boolean | null>(null);
  const lastHeightRef = useRef<number | null>(null);

  const sendDisabled = actionDisabled || !draft.trim() || Boolean(thinkingUnsupportedError) || !canSubmit;

  const updateHeights = useCallback(() => {
    if (typeof window === 'undefined') return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight || '');
    const paddingTop = Number.parseFloat(styles.paddingTop || '0');
    const paddingBottom = Number.parseFloat(styles.paddingBottom || '0');
    if (!Number.isFinite(lineHeight)) return;
    setMinHeight(lineHeight * CHAT_COMPOSER_DEFAULT_LINES + paddingTop + paddingBottom);
    setMaxHeight(lineHeight * maxLines + paddingTop + paddingBottom);
  }, [maxLines]);

  const resizeComposer = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const resolvedMin = minHeight ?? scrollHeight;
    const resolvedMax = maxHeight ?? scrollHeight;
    const nextHeight = Math.min(resolvedMax, Math.max(resolvedMin, scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, [maxHeight, minHeight]);

  const updateCornerRadius = useCallback(() => {
    const composer = composerRef.current;
    const textarea = textareaRef.current;
    if (!composer || !textarea || !minHeight) return;
    const composerHeight = composer.getBoundingClientRect().height;
    const textareaHeight = textarea.getBoundingClientRect().height;
    const delta = Math.max(0, composerHeight - textareaHeight);
    setCornerRadius(Math.ceil((minHeight + delta) / 2));
  }, [minHeight]);

  const updatePadding = useCallback(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const next = Math.max(116, Math.ceil(composer.offsetHeight + 24));
    if (lastHeightRef.current === next) return;
    lastHeightRef.current = next;
    onHeightChange(next);
  }, [onHeightChange]);

  const submitDraft = useCallback(async () => {
    const message = draft;
    if (!message.trim() || sendDisabled) return;
    if (message.length > CHAT_LIMITS.messageMaxChars) {
      return;
    }
    const sent = await onSend(message);
    if (sent) {
      setDraft('');
    }
  }, [draft, onSend, sendDisabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedDraft = window.sessionStorage.getItem(draftStorageKey);
    if (savedDraft) {
      setDraft(savedDraft);
      return;
    }
    setDraft('');
  }, [draftStorageKey]);

  useEffect(() => {
    if (!initialDraft) return;
    setDraft((prev) => {
      if (initialDraft.mode === 'restore') {
        if (prev.trim().length > 0) return prev;
        return initialDraft.value;
      }
      return prev.trim().length > 0 ? `${prev}\n\n${initialDraft.value}` : initialDraft.value;
    });
  }, [initialDraft]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draft) {
      window.sessionStorage.removeItem(draftStorageKey);
    } else {
      window.sessionStorage.setItem(draftStorageKey, draft);
    }
    const hasDraft = Boolean(draft.trim());
    if (lastHasDraftRef.current !== hasDraft) {
      lastHasDraftRef.current = hasDraft;
      onDraftPresenceChange(hasDraft);
    }
  }, [draft, draftStorageKey, onDraftPresenceChange]);

  useLayoutEffect(() => {
    updateHeights();
  }, [updateHeights]);

  useLayoutEffect(() => {
    resizeComposer();
    updateCornerRadius();
    updatePadding();
  }, [draft, resizeComposer, updateCornerRadius, updatePadding]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      updateHeights();
      resizeComposer();
      updateCornerRadius();
      updatePadding();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [resizeComposer, updateCornerRadius, updateHeights, updatePadding]);

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

  const helperTextClass = useMemo(
    () => `flex-[2] whitespace-nowrap text-center ${draft.length > 0 ? 'opacity-10' : ''}`,
    [draft.length]
  );

  if (collapsed) return null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submitDraft();
      }}
      className="pointer-events-none fixed inset-x-0 bottom-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div className="pointer-events-auto mx-auto max-w-6xl px-4 md:pr-12" style={{ paddingLeft: railCollapsed ? '72px' : '320px' }}>
        <div
          ref={composerRef}
          className="flex items-stretch gap-2 border border-divider bg-white px-3 py-2 shadow-composer"
          style={{ borderRadius: cornerRadius ? `${cornerRadius}px` : '9999px' }}
        >
          <div className="flex items-center gap-2">
            <div ref={utilitiesMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (actionDisabled) return;
                  setUtilitiesMenuOpen((prev) => !prev);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-divider/80 bg-white text-xs font-semibold leading-none text-slate-700 transition hover:bg-primary/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Utilities"
                aria-haspopup="menu"
                aria-expanded={utilitiesMenuOpen}
                disabled={actionDisabled}
              >
                <BlueprintIcon icon="plus" className="h-4 w-4" />
              </button>
              {utilitiesMenuOpen ? (
                <div role="menu" className="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-xl border border-divider bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-primary/10"
                    onClick={() => {
                      const htmlCandidate = draft.trim();
                      if (!htmlCandidate || !HTML_TAG_DETECTION_REGEX.test(htmlCandidate)) {
                        setUtilitiesMenuOpen(false);
                        return;
                      }
                      const converted = onConvertHtmlToMarkdown(htmlCandidate);
                      if (converted?.trim()) {
                        setDraft(converted);
                      }
                      setUtilitiesMenuOpen(false);
                    }}
                    disabled={actionDisabled}
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
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      webSearchEnabled ? 'bg-primary/10 text-primary' : 'text-slate-700 hover:bg-primary/10'
                    }`}
                    onClick={() => {
                      if (!webSearchAvailable || isStreaming) return;
                      onToggleWebSearch();
                      setUtilitiesMenuOpen(false);
                    }}
                    disabled={actionDisabled || !webSearchAvailable}
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
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask anything"
              rows={CHAT_COMPOSER_DEFAULT_LINES}
              className="flex-1 w-full resize-none overflow-y-auto rounded-lg border border-slate-200/80 bg-white/70 px-3 pb-6 pt-1.5 text-base leading-relaxed placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:outline-none"
              style={{ minHeight: minHeight ? `${minHeight}px` : undefined, maxHeight: maxHeight ? `${maxHeight}px` : undefined }}
              disabled={inputDisabled}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                if (event.metaKey) {
                  event.preventDefault();
                  void submitDraft();
                }
              }}
            />
            <div className="pointer-events-none absolute inset-x-3 bottom-1 flex items-center text-[11px] text-slate-400">
              <span className="flex-1 text-left">{showOpenAISearchNote ? 'Search uses gpt-4o-mini-search-preview.' : ''}</span>
              <span className={helperTextClass}>⌘ + Enter to send · Shift + Enter adds a newline.</span>
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
                {THINKING_SETTING_LABELS[thinking]} ▾
              </button>
              {thinkingMenuOpen ? (
                <div role="menu" className="absolute bottom-full right-0 z-50 mb-2 w-26 rounded-xl border border-divider bg-white p-1 shadow-lg">
                  {allowedThinking.map((setting) => {
                    const active = thinking === setting;
                    return (
                      <button
                        key={setting}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
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
              <button type="button" onClick={onInterrupt} className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 shadow-sm transition hover:bg-red-100 focus:outline-none" aria-label="Stop streaming">
                <XMarkIcon className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="submit"
              disabled={sendDisabled}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Send message"
            >
              {isSending ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" /> : <ArrowUpIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
});
