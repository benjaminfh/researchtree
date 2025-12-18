'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ChangeEvent, FormEvent } from 'react';
import type { ProjectMetadata, NodeRecord, BranchSummary, MessageNode } from '@git/types';
import type { LLMProvider } from '@/src/server/llm';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';
import { THINKING_SETTINGS, THINKING_SETTING_LABELS, type ThinkingSetting } from '@/src/shared/thinking';
import { features } from '@/src/config/features';
import useSWR from 'swr';
import type { FC } from 'react';
import { WorkspaceGraph } from './WorkspaceGraph';
import { getBranchColor } from './branchColors';
import { InsightFrame } from './InsightFrame';
import {
  ArrowUpRightIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HomeIcon,
  PaperClipIcon,
  PencilIcon,
  QuestionMarkCircleIcon,
  Square2StackIcon,
  XMarkIcon
} from './HeroIcons';

const fetchJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return res.json();
};

type DiffLine = {
  type: 'context' | 'added' | 'removed';
  value: string;
};

interface WorkspaceClientProps {
  project: ProjectMetadata;
  initialBranches: BranchSummary[];
  defaultProvider: LLMProvider;
  providerOptions: ProviderOption[];
}

interface ProviderOption {
  id: LLMProvider;
  label: string;
  defaultModel: string;
}

const NodeBubble: FC<{
  node: NodeRecord;
  muted?: boolean;
  subtitle?: string;
  isStarred?: boolean;
  onToggleStar?: () => void;
  onEdit?: (node: MessageNode) => void;
  isCanvasDiffPinned?: boolean;
  onPinCanvasDiff?: (mergeNodeId: string) => Promise<void>;
}> = ({
  node,
  muted = false,
  subtitle,
  isStarred = false,
  onToggleStar,
  onEdit,
  isCanvasDiffPinned = false,
  onPinCanvasDiff
}) => {
  const isUser = node.type === 'message' && node.role === 'user';
  const canCopy = node.type === 'message' && node.content.length > 0;
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCanvasDiff, setShowCanvasDiff] = useState(false);
  const [confirmPinCanvasDiff, setConfirmPinCanvasDiff] = useState(false);
  const [pinCanvasDiffError, setPinCanvasDiffError] = useState<string | null>(null);
  const [isPinningCanvasDiff, setIsPinningCanvasDiff] = useState(false);
  const base = `relative max-w-[82%] overflow-hidden rounded-2xl px-4 py-3 transition ${
    isUser ? 'min-w-[300px]' : ''
  }`;
  const palette = muted
    ? isUser
      ? 'bg-slate-100 text-slate-900'
      : 'bg-slate-50 text-slate-900'
    : isUser
    ? 'bg-slate-50 text-slate-900'
    : 'bg-white text-slate-900';
  const align = isUser ? 'ml-auto items-end' : 'mr-auto items-start';

  const copyToClipboard = async (text: string) => {
    if (typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // ignore and fall back
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <article className={`flex flex-col gap-1 ${align}`}>
      <div className={`${base} ${palette}`}>
        {'content' in node && node.content ? (
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">{node.content}</p>
        ) : null}
        {node.type === 'state' ? <p className="mt-2 text-sm font-medium text-slate-700">Canvas updated</p> : null}
        {node.type === 'merge' ? <p className="mt-2 text-sm font-medium text-slate-700">Merge: {node.mergeSummary}</p> : null}
        {node.type === 'merge' && node.canvasDiff ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <button
                type="button"
                onClick={() => setShowCanvasDiff((prev) => !prev)}
                className="rounded-full border border-divider/70 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-primary/10"
                aria-label={showCanvasDiff ? 'Hide canvas diff' : 'Show canvas diff'}
              >
                {showCanvasDiff ? 'Hide canvas diff' : 'Show canvas diff'}
              </button>

              {onPinCanvasDiff ? (
                isCanvasDiffPinned ? (
                  <span className="font-semibold text-emerald-700" aria-label="Canvas diff is in context">
                    Diff in context
                  </span>
                ) : confirmPinCanvasDiff ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isPinningCanvasDiff}
                      onClick={() => {
                        void (async () => {
                          if (node.type !== 'merge') return;
                          setPinCanvasDiffError(null);
                          setIsPinningCanvasDiff(true);
                          try {
                            await onPinCanvasDiff(node.id);
                            setConfirmPinCanvasDiff(false);
                          } catch (err) {
                            setPinCanvasDiffError((err as Error)?.message ?? 'Failed to add diff to context');
                          } finally {
                            setIsPinningCanvasDiff(false);
                          }
                        })();
                      }}
                      className="rounded-full bg-primary px-3 py-1 font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                      aria-label="Confirm add canvas diff to context"
                    >
                      {isPinningCanvasDiff ? 'Adding…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      disabled={isPinningCanvasDiff}
                      onClick={() => {
                        setConfirmPinCanvasDiff(false);
                        setPinCanvasDiffError(null);
                      }}
                      className="rounded-full border border-divider/70 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      aria-label="Cancel add canvas diff to context"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmPinCanvasDiff(true)}
                    className="rounded-full border border-divider/70 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-primary/10"
                    aria-label="Add canvas diff to context"
                  >
                    Add diff to context
                  </button>
                )
              ) : null}
            </div>

            {showCanvasDiff ? (
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-800">
                {node.canvasDiff}
              </pre>
            ) : null}
            {pinCanvasDiffError ? <p className="mt-2 text-xs text-red-600">{pinCanvasDiffError}</p> : null}
          </div>
        ) : null}
        {subtitle ? <div className="mt-2 text-xs text-slate-500">{subtitle}</div> : null}

        <div
          className={`mt-3 flex flex-wrap items-center gap-2 text-xs text-muted ${
            isUser ? 'justify-end' : 'justify-start'
          }`}
        >
          {isUser ? <span>{new Date(node.timestamp).toLocaleTimeString()}</span> : null}
          {onToggleStar ? (
            <button
              type="button"
              onClick={onToggleStar}
              className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 hover:bg-primary/10 hover:text-primary focus:outline-none"
              aria-label={isStarred ? 'Unstar node' : 'Star node'}
            >
              {isStarred ? '★' : '☆'}
            </button>
          ) : null}
          {canCopy ? (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await copyToClipboard(node.content);
                  setCopyFeedback(true);
                  if (copyFeedbackTimeoutRef.current) {
                    clearTimeout(copyFeedbackTimeoutRef.current);
                  }
                  copyFeedbackTimeoutRef.current = setTimeout(() => {
                    setCopyFeedback(false);
                  }, 1200);
                })();
              }}
              className={`rounded-full bg-slate-100 px-2 py-1 hover:bg-primary/10 focus:outline-none ${
                copyFeedback ? 'text-emerald-600' : 'text-slate-600 hover:text-primary'
              }`}
              aria-label="Copy message"
            >
              {copyFeedback ? <CheckIcon className="h-4 w-4" /> : <Square2StackIcon className="h-4 w-4" />}
            </button>
          ) : null}
          {node.type === 'message' && onEdit && (node.role === 'user' || features.uiEditAnyMessage) ? (
            <button
              type="button"
              onClick={() => onEdit(node)}
              className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 hover:bg-primary/10 hover:text-primary focus:outline-none"
              aria-label="Edit message"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          ) : null}
          {!isUser ? <span>{new Date(node.timestamp).toLocaleTimeString()}</span> : null}
        </div>
      </div>
    </article>
  );
};

const ChatNodeRow: FC<{
  node: NodeRecord;
  trunkName: string;
  muted?: boolean;
  subtitle?: string;
  messageInsetClassName?: string;
  isStarred?: boolean;
  onToggleStar?: () => void;
  onEdit?: (node: MessageNode) => void;
  isCanvasDiffPinned?: boolean;
  onPinCanvasDiff?: (mergeNodeId: string) => Promise<void>;
}> = ({ node, trunkName, muted, subtitle, messageInsetClassName, isStarred, onToggleStar, onEdit, isCanvasDiffPinned, onPinCanvasDiff }) => {
  const isUser = node.type === 'message' && node.role === 'user';
  const stripeColor = getBranchColor(node.createdOnBranch ?? trunkName, trunkName);

  return (
    <div className="grid grid-cols-[14px_1fr] items-stretch">
      <div className="flex justify-center">
        <div
          data-testid="chat-row-stripe"
          className="h-full w-1"
          style={{ backgroundColor: stripeColor, opacity: 0.9 }}
        />
      </div>
      <div className={`py-2 ${messageInsetClassName ?? ''} ${isUser ? 'flex justify-end' : 'flex justify-start'}`}>
        <NodeBubble
          node={node}
          muted={muted}
          subtitle={subtitle}
          isStarred={isStarred}
          onToggleStar={onToggleStar}
          onEdit={onEdit}
          isCanvasDiffPinned={isCanvasDiffPinned}
          onPinCanvasDiff={onPinCanvasDiff}
        />
      </div>
    </div>
  );
};

export function WorkspaceClient({ project, initialBranches, defaultProvider, providerOptions }: WorkspaceClientProps) {
  const COLLAPSE_KEY = 'sidequest:rail-collapsed';
  const CHAT_WIDTH_KEY = `sidequest:chat-width:${project.id}`;
  const [branchName, setBranchName] = useState(project.branchName ?? 'main');
  const [branches, setBranches] = useState(initialBranches);
  const [branchActionError, setBranchActionError] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSummary, setMergeSummary] = useState('');
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergePreview, setMergePreview] = useState<{ trunk: string; branch: string } | null>(null);
  const [isMergePreviewLoading, setIsMergePreviewLoading] = useState(false);
  const [mergePreviewError, setMergePreviewError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNode, setEditingNode] = useState<MessageNode | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editBranchName, setEditBranchName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [artefactDraft, setArtefactDraft] = useState('');
  const [isSavingArtefact, setIsSavingArtefact] = useState(false);
  const [artefactError, setArtefactError] = useState<string | null>(null);
  const autosaveControllerRef = useRef<AbortController | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSavingTokenRef = useRef(0);
  const autosaveSpinnerUntilRef = useRef<number | null>(null);
  const autosaveSpinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [insightTab, setInsightTab] = useState<'graph' | 'canvas'>('canvas');
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  const [chatPaneWidth, setChatPaneWidth] = useState<number | null>(null);
  const paneContainerRef = useRef<HTMLDivElement | null>(null);
  const isResizingRef = useRef(false);
  const savedChatPaneWidthRef = useRef<number | null>(null);
  const [graphHistories, setGraphHistories] = useState<Record<string, NodeRecord[]> | null>(null);
  const [graphHistoryError, setGraphHistoryError] = useState<string | null>(null);
  const [graphHistoryLoading, setGraphHistoryLoading] = useState(false);
  const [graphMode, setGraphMode] = useState<'nodes' | 'collapsed' | 'starred'>('collapsed');
  const isGraphVisible = !insightCollapsed && insightTab === 'graph';

  const {
    data: starsData,
    mutate: mutateStars
  } = useSWR<{ starredNodeIds: string[] }>(`/api/projects/${project.id}/stars`, fetchJson, { revalidateOnFocus: true });

  const starredNodeIds = starsData?.starredNodeIds ?? [];
  const starredSet = useMemo(() => new Set(starredNodeIds), [starredNodeIds]);

  const toggleStar = async (nodeId: string) => {
    const prev = starredNodeIds;
    const next = starredSet.has(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId];
    await mutateStars({ starredNodeIds: next }, false);
    try {
      const res = await fetch(`/api/projects/${project.id}/stars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId })
      });
      if (!res.ok) {
        throw new Error('Failed to update star');
      }
      const data = (await res.json()) as { starredNodeIds: string[] };
      await mutateStars({ starredNodeIds: data.starredNodeIds }, false);
    } catch {
      await mutateStars({ starredNodeIds: prev }, false);
    }
  };
  const { nodes, artefact, artefactMeta, isLoading, error, mutateHistory, mutateArtefact } = useProjectData(project.id, {
    ref: branchName
  });
  const draftStorageKey = `researchtree:draft:${project.id}`;
  const [draft, setDraft] = useState('');
  const [streamPreview, setStreamPreview] = useState('');
  const [provider, setProvider] = useState<LLMProvider>(defaultProvider);
  const providerStorageKey = useMemo(
    () => `researchtree:provider:${project.id}:${branchName}`,
    [project.id, branchName]
  );
  const [thinking, setThinking] = useState<ThinkingSetting>('medium');
  const thinkingStorageKey = useMemo(
    () => `researchtree:thinking:${project.id}:${branchName}`,
    [project.id, branchName]
  );
  const [thinkingHydratedKey, setThinkingHydratedKey] = useState<string | null>(null);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null);

  const { sendMessage, interrupt, state } = useChatStream({
    projectId: project.id,
    ref: branchName,
    provider,
    thinking,
    onChunk: (chunk) => setStreamPreview((prev) => prev + chunk),
    onComplete: async () => {
      setStreamPreview('');
      setDraft('');
      await Promise.all([mutateHistory(), mutateArtefact()]);
    }
  });

  const activeProvider = useMemo(
    () => providerOptions.find((option) => option.id === provider),
    [provider, providerOptions]
  );

  const sendDraft = async () => {
    if (!draft.trim() || state.isStreaming) return;
    await sendMessage(draft);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendDraft();
  };

  const streamingNode: NodeRecord | null =
    streamPreview.length > 0
      ? {
          id: 'streaming',
          type: 'message',
          role: 'assistant',
          content: streamPreview,
          timestamp: Date.now(),
          parent: null,
          interrupted: state.error !== null
        }
      : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedDraft = window.sessionStorage.getItem(draftStorageKey);
    if (savedDraft) {
      setDraft(savedDraft);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setThinkingHydratedKey(null);
    const saved = window.localStorage.getItem(thinkingStorageKey) as ThinkingSetting | null;
    const isValid = saved && (THINKING_SETTINGS as readonly string[]).includes(saved);
    setThinking(isValid ? (saved as ThinkingSetting) : 'medium');
    setThinkingHydratedKey(thinkingStorageKey);
  }, [thinkingStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (thinkingHydratedKey !== thinkingStorageKey) return;
    window.localStorage.setItem(thinkingStorageKey, thinking);
  }, [thinking, thinkingHydratedKey, thinkingStorageKey]);

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
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(CHAT_WIDTH_KEY);
    if (!raw) return;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setChatPaneWidth(parsed);
    }
  }, [CHAT_WIDTH_KEY]);

  useEffect(() => {
    const handleMove = (event: MouseEvent | TouchEvent) => {
      if (!isResizingRef.current) return;
      const container = paneContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (typeof TouchEvent !== 'undefined' && event instanceof TouchEvent && event.cancelable) {
        event.preventDefault();
      }
      const clientX =
        typeof TouchEvent !== 'undefined' && event instanceof TouchEvent
          ? (event.touches[0]?.clientX ?? rect.left)
          : (event as MouseEvent).clientX;

      const rightMin = insightCollapsed ? 56 : 360;
      const minChat = 380;
      const maxChat = Math.max(minChat, rect.width - rightMin - 24);
      const next = Math.min(maxChat, Math.max(minChat, clientX - rect.left));
      setChatPaneWidth(Math.round(next));
    };

    const stop = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      if (typeof window !== 'undefined' && chatPaneWidth) {
        window.localStorage.setItem(CHAT_WIDTH_KEY, String(chatPaneWidth));
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', stop);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', handleMove as any);
      window.removeEventListener('touchend', stop);
    };
  }, [CHAT_WIDTH_KEY, chatPaneWidth, insightCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!draft) {
      window.sessionStorage.removeItem(draftStorageKey);
    } else {
      window.sessionStorage.setItem(draftStorageKey, draft);
    }
  }, [draft, draftStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedProvider = window.localStorage.getItem(providerStorageKey) as LLMProvider | null;
    const isValid = savedProvider && providerOptions.some((option) => option.id === savedProvider);
    const nextProvider = (isValid ? savedProvider : defaultProvider) as LLMProvider;
    setProvider((prev) => (prev === nextProvider ? prev : nextProvider));
  }, [providerStorageKey, providerOptions, defaultProvider]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(providerStorageKey, provider);
  }, [provider, providerStorageKey]);

  const handleProviderChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setProvider(event.target.value as LLMProvider);
  };

  useEffect(() => {
    setArtefactDraft(artefact);
  }, [artefact]);

  const trunkName = useMemo(() => branches.find((b) => b.isTrunk)?.name ?? 'main', [branches]);
  const displayBranchName = (name: string) => (name === trunkName ? 'trunk' : name);
  const sortedBranches = branches;

  useEffect(() => {
    if (insightCollapsed || insightTab !== 'graph') return;
    const controller = new AbortController();
    const load = async () => {
      setGraphHistoryLoading(true);
      setGraphHistoryError(null);
      try {
        const MAX_PER_BRANCH = 500;
        const entries = await Promise.all(
          sortedBranches.map(async (branch) => {
            const limit = Math.min(branch.nodeCount, MAX_PER_BRANCH);
            const res = await fetch(
              `/api/projects/${project.id}/history?ref=${encodeURIComponent(branch.name)}&limit=${limit}`,
              { signal: controller.signal }
            );
            if (!res.ok) {
              throw new Error(`Failed to load history for ${branch.name}`);
            }
            const data = (await res.json()) as { nodes: NodeRecord[] };
            return [branch.name, data.nodes ?? []] as const;
          })
        );
        const mapped: Record<string, NodeRecord[]> = {};
        for (const [name, nodes] of entries) {
          mapped[name] = nodes;
        }
        setGraphHistories(mapped);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setGraphHistoryError((err as Error).message);
      } finally {
        setGraphHistoryLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [insightCollapsed, insightTab, sortedBranches, project.id]);

  useEffect(() => {
    if (!isGraphVisible) return;
    setGraphHistories((prev) => {
      if (!prev) return prev;
      const current = prev[branchName];
      if (current === nodes) return prev;
      return { ...prev, [branchName]: nodes };
    });
  }, [isGraphVisible, branchName, nodes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (artefactDraft === artefact) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      if (autosaveControllerRef.current) {
        autosaveControllerRef.current.abort();
      }
      const controller = new AbortController();
      autosaveControllerRef.current = controller;

      autosaveSavingTokenRef.current += 1;
      const token = autosaveSavingTokenRef.current;
      autosaveSpinnerUntilRef.current = Date.now() + 2000;
      if (autosaveSpinnerTimeoutRef.current) {
        clearTimeout(autosaveSpinnerTimeoutRef.current);
        autosaveSpinnerTimeoutRef.current = null;
      }

      setIsSavingArtefact(true);
      setArtefactError(null);
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${project.id}/artefact?ref=${encodeURIComponent(branchName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: artefactDraft }),
            signal: controller.signal
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error?.message ?? 'Failed to save canvas');
          }
          await mutateArtefact();
          await mutateHistory();
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          setArtefactError((err as Error).message);
        } finally {
          if (autosaveSavingTokenRef.current !== token) return;
          const until = autosaveSpinnerUntilRef.current ?? Date.now();
          const remaining = Math.max(0, until - Date.now());
          if (remaining === 0) {
            setIsSavingArtefact(false);
            return;
          }
          autosaveSpinnerTimeoutRef.current = setTimeout(() => {
            if (autosaveSavingTokenRef.current !== token) return;
            setIsSavingArtefact(false);
          }, remaining);
        }
      })();
    }, 2000);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [artefactDraft, artefact, branchName, trunkName, project.id, mutateArtefact, mutateHistory]);

  useEffect(() => {
    return () => {
      if (autosaveControllerRef.current) {
        autosaveControllerRef.current.abort();
      }
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      if (autosaveSpinnerTimeoutRef.current) {
        clearTimeout(autosaveSpinnerTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showMergeModal) {
      setMergePreview(null);
      setMergePreviewError(null);
      setIsMergePreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsMergePreviewLoading(true);
    setMergePreviewError(null);
    const loadPreview = async () => {
      try {
        const baseUrl = `/api/projects/${project.id}/artefact`;
        const [trunkRes, branchRes] = await Promise.all([
          fetch(`${baseUrl}?ref=${encodeURIComponent(trunkName)}`, { signal: controller.signal }),
          fetch(`${baseUrl}?ref=${encodeURIComponent(branchName)}`, { signal: controller.signal })
        ]);
        if (!trunkRes.ok || !branchRes.ok) {
          throw new Error('Unable to load Canvas preview');
        }
        const [trunkPayload, branchPayload] = await Promise.all([trunkRes.json(), branchRes.json()]);
        if (controller.signal.aborted) {
          return;
        }
        setMergePreview({
          trunk: trunkPayload?.artefact ?? '',
          branch: branchPayload?.artefact ?? ''
        });
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
          return;
        }
        setMergePreview(null);
        setMergePreviewError((error as Error).message ?? 'Unable to load Canvas preview');
      } finally {
        if (!controller.signal.aborted) {
          setIsMergePreviewLoading(false);
        }
      }
    };
    void loadPreview();
    return () => {
      controller.abort();
    };
  }, [showMergeModal, branchName, trunkName, project.id]);

  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored) {
      setRailCollapsed(stored === 'true');
    }
  }, []);

  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      }
      return next;
    });
  };

  const [showHints, setShowHints] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const scrollFollowThreshold = 72;

  const combinedNodes = useMemo(() => (streamingNode ? [...nodes, streamingNode] : nodes), [nodes, streamingNode]);
  const lastUpdatedTimestamp = useMemo(() => {
    const historyLatest = combinedNodes[combinedNodes.length - 1]?.timestamp ?? null;
    const artefactUpdated = artefactMeta?.lastUpdatedAt ?? null;
    return historyLatest && artefactUpdated ? Math.max(historyLatest, artefactUpdated) : historyLatest ?? artefactUpdated;
  }, [combinedNodes, artefactMeta]);

  const mergeDiff = useMemo<DiffLine[]>(() => {
    if (!mergePreview) {
      return [];
    }
    return buildLineDiff(mergePreview.trunk, mergePreview.branch);
  }, [mergePreview]);
  const hasCanvasChanges = mergeDiff.some((line) => line.type !== 'context');
  const shouldFetchTrunk = branchName !== trunkName;
  const historyFetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    return res.json() as Promise<{ nodes: NodeRecord[] }>;
  };
  const { data: trunkHistory } = useSWR<{ nodes: NodeRecord[] }>(
    shouldFetchTrunk ? `/api/projects/${project.id}/history?ref=${encodeURIComponent(trunkName)}` : null,
    historyFetcher
  );
  const trunkNodeCount = useMemo(() => branches.find((b) => b.isTrunk)?.nodeCount ?? 0, [branches]);
  const [sharedCount, setSharedCount] = useState(0);
  useEffect(() => {
    const prefixLength = (a: NodeRecord[], b: NodeRecord[]) => {
      const min = Math.min(a.length, b.length);
      let idx = 0;
      while (idx < min && a[idx]?.id === b[idx]?.id) {
        idx += 1;
      }
      return idx;
    };

    if (branchName === trunkName) {
      setSharedCount(0);
      return;
    }

    const trunkPrefix =
      trunkHistory?.nodes && trunkHistory.nodes.length > 0
        ? prefixLength(trunkHistory.nodes, combinedNodes)
        : Math.min(trunkNodeCount, combinedNodes.length);
    setSharedCount(trunkPrefix);

    const aborted = { current: false };
    const compute = async () => {
      const others = branches.filter((b) => b.name !== branchName);
      if (others.length === 0) return;
      const histories = await Promise.all(
        others.map(async (b) => {
          try {
            const res = await fetch(
              `/api/projects/${project.id}/history?ref=${encodeURIComponent(b.name)}&limit=${combinedNodes.length}`
            );
            if (!res.ok) return null;
            const data = (await res.json()) as { nodes: NodeRecord[] };
            return { name: b.name, nodes: data.nodes ?? [] };
          } catch {
            return null;
          }
        })
      );
      const longest = histories.reduce((max, entry) => {
        if (!entry) return max;
        const min = Math.min(entry.nodes.length, combinedNodes.length);
        let idx = 0;
        while (idx < min && entry.nodes[idx]?.id === combinedNodes[idx]?.id) {
          idx += 1;
        }
        return Math.max(max, idx);
      }, trunkPrefix);
      if (!aborted.current) {
        setSharedCount(longest);
      }
    };
    void compute();
    return () => {
      aborted.current = true;
    };
  }, [branchName, trunkName, trunkHistory, trunkNodeCount, combinedNodes, branches, project.id]);
  const [hideShared, setHideShared] = useState(branchName !== trunkName);
  useEffect(() => {
    setHideShared(branchName !== trunkName);
  }, [branchName, trunkName]);
  const { sharedNodes, branchNodes } = useMemo(() => {
    const shared = combinedNodes.slice(0, sharedCount);
    return {
      sharedNodes: shared,
      branchNodes: combinedNodes.slice(sharedCount)
    };
  }, [combinedNodes, sharedCount]);

  const pinnedCanvasDiffMergeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of combinedNodes) {
      if (node.type === 'message' && node.pinnedFromMergeId) {
        ids.add(node.pinnedFromMergeId);
      }
    }
    return ids;
  }, [combinedNodes]);

  const pinCanvasDiffToContext = async (mergeNodeId: string) => {
    const res = await fetch(`/api/projects/${project.id}/merge/pin-canvas-diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mergeNodeId, targetBranch: branchName })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error?.message ?? 'Failed to add diff to context');
    }
    await mutateHistory();
  };

  useEffect(() => {
    shouldScrollToBottomRef.current = true;
  }, [branchName]);

		  useEffect(() => {
		    if (!shouldScrollToBottomRef.current) return;
		    if (isLoading) return;
		    const el = messageListRef.current;
		    if (!el) return;
		    // Ensure we scroll after the DOM has painted with the final node list.
		    requestAnimationFrame(() => {
		      el.scrollTop = el.scrollHeight;
		    });
		  }, [branchName, isLoading, combinedNodes.length, streamPreview]);

  const handleMessageListScroll = () => {
    const el = messageListRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldScrollToBottomRef.current = distance <= scrollFollowThreshold;
  };

  const switchBranch = async (name: string) => {
    if (name === branchName) return;
    setIsSwitching(true);
    setBranchActionError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/branches`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to switch branch');
      }
      const data = (await res.json()) as { branchName: string; branches: BranchSummary[] };
      setBranchName(data.branchName);
      setBranches(data.branches);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
        window.localStorage.setItem(`researchtree:thinking:${project.id}:${data.branchName}`, thinking);
      }
      await Promise.all([mutateHistory(), mutateArtefact()]);
    } catch (err) {
      setBranchActionError((err as Error).message);
    } finally {
      setIsSwitching(false);
    }
  };

  const createBranch = async () => {
    if (!newBranchName.trim()) return;
    setIsCreating(true);
    setBranchActionError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBranchName.trim(), fromRef: branchName })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to create branch');
      }
      const data = (await res.json()) as { branchName: string; branches: BranchSummary[] };
      setBranchName(data.branchName);
      setBranches(data.branches);
      setNewBranchName('');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
        window.localStorage.setItem(`researchtree:thinking:${project.id}:${data.branchName}`, thinking);
      }
      await Promise.all([mutateHistory(), mutateArtefact()]);
    } catch (err) {
      setBranchActionError((err as Error).message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-white text-slate-800">
      <div className="grid h-full" style={{ gridTemplateColumns: railCollapsed ? '72px 1fr' : '270px 1fr' }}>
        <aside className="relative flex h-full flex-col border-r border-divider/80 bg-[rgba(238,243,255,0.85)] px-3 py-6 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleRail}
              className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 shadow-sm hover:bg-primary/10"
              aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {railCollapsed ? <ChevronRightIcon className="h-5 w-5" /> : <ChevronLeftIcon className="h-5 w-5" />}
            </button>
            {!railCollapsed ? (
              <div className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-divider/70 bg-white px-4 text-xs font-semibold tracking-wide text-primary shadow-sm">
                <span>SideQuest</span>
              </div>
            ) : null}
          </div>
          <div className="mt-6 flex h-full flex-col gap-6">
            {!railCollapsed ? (
              <>
                <div className="space-y-3 overflow-hidden">
                  <div className="flex items-center justify-between px-3 text-sm text-muted">
                    <span>Branches</span>
                    <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-slate-700">
                      {sortedBranches.length}
                    </span>
                  </div>
                  <div className="space-y-1 overflow-y-auto pr-1">
                    {sortedBranches.map((branch) => (
                      <button
                        key={branch.name}
                        type="button"
                        onClick={() => void switchBranch(branch.name)}
                        disabled={isSwitching || isCreating}
                        className={`w-full rounded-full px-3 py-2 text-left text-sm transition focus:outline-none ${
                          branchName === branch.name
                            ? 'bg-primary/15 text-primary shadow-sm'
                            : 'text-slate-700 hover:bg-white/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate ${
                              branch.isTrunk
                                ? branchName === branch.name
                                  ? 'font-semibold text-primary'
                                  : 'font-semibold text-slate-900'
                                : ''
                            }`}
                          >
                            {displayBranchName(branch.name)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {branchActionError ? <p className="text-sm text-red-600">{branchActionError}</p> : null}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createBranch();
                  }}
                  className="space-y-3 rounded-2xl border border-divider/80 bg-white/80 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">New branch</span>
                    <span className="text-xs text-muted">{displayBranchName(branchName)} →</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(event) => setNewBranchName(event.target.value)}
                      placeholder="feature/idea"
                      className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                      disabled={isCreating || isSwitching}
                    />
                    <button
                      type="submit"
                      disabled={isCreating || isSwitching}
                      className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isCreating ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </form>

              </>
            ) : null}

            {railCollapsed ? (
              <div className="mt-auto flex justify-start pb-2">
                <Link
                  href="/"
                  className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
                  aria-label="Back to home"
                >
                  <HomeIcon className="h-5 w-5" />
                </Link>
              </div>
            ) : (
              <div className="mt-auto space-y-3 pb-2">
                <div className="flex flex-col items-start gap-3">
                  {showHints ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowHints(false)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setShowHints(false);
                        }
                      }}
                      className="w-full cursor-pointer rounded-2xl bg-white/80 p-4 text-sm shadow-sm transition hover:bg-primary/10"
                      aria-label="Hide session tips"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900">Session tips</p>
                      </div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                        <li>⌘ + Enter to send · Shift + Enter adds a newline.</li>
                        <li>Branch to try edits without losing the trunk.</li>
                        <li>Canvas edits are per-branch; merge intentionally carries a diff summary.</li>
                      </ul>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowHints(true)}
                      className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                      aria-label="Show session tips"
                    >
                      <QuestionMarkCircleIcon className="h-5 w-5" />
                    </button>
                  )}

                  <Link
                    href="/"
                    className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                    aria-label="Back to home"
                  >
                    <HomeIcon className="h-5 w-5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="relative flex h-full min-h-0 flex-col bg-white">
          <div className="px-6 pt-6 md:px-8 lg:px-12">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
                <span>SideQuest</span>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">Workspace</span>
              </div>
              <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
              <span className="text-sm text-muted">{project.description ?? 'No description provided.'}</span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-36 pt-4 md:px-8 lg:px-12">
          <div ref={paneContainerRef} className="flex h-full min-h-0 flex-col gap-6 lg:flex-row lg:gap-0">
            <section
              className={`card-surface relative flex h-full min-h-0 flex-col gap-4 p-5 ${chatPaneWidth ? 'flex-none' : 'flex-1'}`}
              style={chatPaneWidth ? { width: chatPaneWidth } : undefined}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Conversation</p>
                  <p className="text-sm text-muted">
                    Branch {displayBranchName(branchName)} · {combinedNodes.length} message{combinedNodes.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-sm text-muted">{activeProvider?.defaultModel ?? 'mock'}</span>
                  <div className="flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-sm shadow-sm">
                    <label className="font-medium text-slate-700" htmlFor="provider-select">
                      Provider
                    </label>
                    <select
                      id="provider-select"
                      value={provider}
                      onChange={handleProviderChange}
                      className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-sm text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                    >
                      {providerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

                {branchName !== trunkName && sharedCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[rgba(238,243,255,0.7)] px-4 py-3 text-sm text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary/80" />
                      Shared {sharedCount} {sharedCount === 1 ? 'message' : 'messages'} from upstream
                    </div>
                    <button
                      type="button"
                      onClick={() => setHideShared((prev) => !prev)}
                      className="rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
                    >
                      {hideShared ? 'Show shared' : 'Hide shared'}
                    </button>
                  </div>
                ) : null}

	                <div
                    ref={messageListRef}
                    data-testid="chat-message-list"
                    className="flex-1 min-h-0 overflow-y-auto pr-1 pb-20"
                    onScroll={handleMessageListScroll}
                  >
                  {isLoading ? (
                    <p className="text-sm text-muted">Loading history…</p>
                  ) : error ? (
                    <p className="text-sm text-red-600">Failed to load history.</p>
                  ) : combinedNodes.length === 0 ? (
                    <p className="text-sm text-muted">No nodes yet. Start with a system prompt or question.</p>
                  ) : (
                    <div className="flex flex-col">
                      {!hideShared && sharedNodes.length > 0 ? (
                        <div className="relative">
                          <div className="pointer-events-none absolute left-[14px] right-0 top-0 h-full rounded-2xl bg-slate-50" />
                          <div className="relative flex flex-col">
                            {sharedNodes.map((node) => (
                              <ChatNodeRow
                                key={node.id}
                                node={node}
                                trunkName={trunkName}
                                muted
                                messageInsetClassName="pr-3"
                                subtitle={node.createdOnBranch ? `from ${node.createdOnBranch}` : undefined}
                                isStarred={starredSet.has(node.id)}
                                onToggleStar={() => void toggleStar(node.id)}
                                onEdit={undefined}
                                isCanvasDiffPinned={undefined}
                                onPinCanvasDiff={undefined}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {!hideShared && sharedNodes.length > 0 && branchNodes.length > 0 ? (
                        <div className="py-1" />
                      ) : null}

                      {branchNodes.map((node) => (
                        <ChatNodeRow
                          key={node.id}
                          node={node}
                          trunkName={trunkName}
                          messageInsetClassName="pr-3"
                          isStarred={starredSet.has(node.id)}
                          onToggleStar={() => void toggleStar(node.id)}
                          onEdit={
                            node.type === 'message' && (node.role === 'user' || features.uiEditAnyMessage)
                              ? (n) => {
                                  setEditingNode(n);
                                  setEditDraft(n.content);
                                  setEditBranchName('');
                                  setEditError(null);
                                  setShowEditModal(true);
                                }
                              : undefined
                          }
                          isCanvasDiffPinned={node.type === 'merge' ? pinnedCanvasDiffMergeIds.has(node.id) : undefined}
                          onPinCanvasDiff={node.type === 'merge' ? pinCanvasDiffToContext : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {hideShared && branchNodes.length === 0 && sharedCount > 0 ? (
                  <p className="text-sm italic text-muted">No new messages on this branch yet.</p>
                ) : null}

                {branchName !== trunkName ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMergeError(null);
                      setMergeSummary('');
                      setShowMergeModal(true);
                    }}
                    disabled={isMerging}
                    className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10 disabled:opacity-60"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ArrowUpRightIcon className="h-4 w-4" />
                    </span>
                    Merge into trunk
                  </button>
                ) : null}

                {state.error ? (
                  <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {state.error}
                    <button
                      type="button"
                      onClick={() => void sendDraft()}
                      className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </section>

            <div className="hidden lg:flex h-full w-6 items-stretch">
              <div
                role="separator"
                aria-orientation="vertical"
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (insightCollapsed) return;
                  isResizingRef.current = true;
                }}
                onTouchStart={() => {
                  if (insightCollapsed) return;
                  isResizingRef.current = true;
                }}
                className={`group mx-auto flex w-1 items-center justify-center rounded-full bg-transparent ${
                  insightCollapsed ? 'cursor-not-allowed opacity-40' : 'cursor-col-resize'
                }`}
              >
                <div className="h-full w-px bg-divider/70 transition group-hover:bg-primary/40" />
              </div>
            </div>

            <div
              className={`flex h-full min-h-0 flex-col gap-4 ${
                insightCollapsed ? 'lg:w-14 lg:flex-none' : 'lg:min-w-[360px] lg:flex-1'
              }`}
            >
              {insightCollapsed ? (
                <button
                  type="button"
                  onClick={() => {
                    setInsightCollapsed(false);
                    if (savedChatPaneWidthRef.current) {
                      setChatPaneWidth(savedChatPaneWidthRef.current);
                    }
                  }}
                  aria-label="Show canvas / graph panel"
                  className="card-surface flex h-full w-full items-start justify-center rounded-2xl border border-dashed border-divider/70 bg-white/80 px-2 py-6 text-sm font-semibold text-primary shadow-sm hover:bg-primary/5"
                >
                  <span className="whitespace-nowrap text-xs font-semibold tracking-wide text-slate-700 [writing-mode:vertical-rl] [text-orientation:mixed]">
                    Canvas | Graph
                  </span>
                </button>
              ) : (
                <section className="card-surface flex h-full min-h-0 flex-col gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-1 items-center gap-1 rounded-full bg-slate-100/80 p-1 text-xs font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => setInsightTab('canvas')}
                        className={`flex-1 rounded-full px-3 py-1 transition ${
                          insightTab === 'canvas' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Canvas
                      </button>
                      <button
                        type="button"
                        onClick={() => setInsightTab('graph')}
                        className={`flex-1 rounded-full px-3 py-1 transition ${
                          insightTab === 'graph' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Quest graph
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        savedChatPaneWidthRef.current = chatPaneWidth;
                        setChatPaneWidth(null);
                        setInsightCollapsed(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-divider/80 bg-white px-4 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10"
                      aria-label="Hide canvas / graph panel"
                    >
                      Hide
                    </button>
                  </div>
                  <div className="flex flex-1 min-h-0 flex-col">
                    {insightTab === 'graph' ? (
                      <div className="flex-1 min-h-0">
                        {graphHistoryLoading ? (
                          <div className="flex h-full items-center justify-center text-sm text-muted">Loading graph…</div>
                        ) : graphHistoryError ? (
                          <div className="flex h-full items-center justify-center text-sm text-red-600">{graphHistoryError}</div>
                        ) : (
                          <div className="flex h-full min-h-0 flex-col">
                            <WorkspaceGraph
                              branchHistories={
                                graphHistories ?? {
                                  [branchName]: combinedNodes
                                }
                              }
                              activeBranchName={branchName}
                              trunkName={trunkName}
                              mode={graphMode}
                              onModeChange={setGraphMode}
                              starredNodeIds={starredNodeIds}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
		                      <div className="flex flex-1 min-h-0 flex-col gap-3">
		                        <InsightFrame className="relative flex-1 min-h-0" innerClassName="relative">
                              <div className="relative h-full">
                                <textarea
                                  value={artefactDraft}
                                  onChange={(event) => setArtefactDraft(event.target.value)}
                                  className="h-full w-full resize-none bg-transparent px-4 py-4 pb-12 text-sm leading-relaxed text-slate-800 focus:outline-none"
                                />
                                {isSavingArtefact || artefactError ? (
                                  <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur">
                                    {isSavingArtefact ? (
                                      <>
                                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary/70" />
                                        <span>Saving…</span>
                                      </>
                                    ) : null}
                                    {!isSavingArtefact && artefactError ? <span className="text-red-600">{artefactError}</span> : null}
                                  </div>
                                ) : null}
                              </div>
		                        </InsightFrame>
		                      </div>
	                    )}
	                  </div>
	                </section>
	              )}
            </div>
          </div>
        </div>

          <form
            onSubmit={handleSubmit}
            className="pointer-events-none fixed inset-x-0 bottom-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          >
            <div
              className="pointer-events-auto mx-auto max-w-6xl px-4 md:pr-12"
              style={{ paddingLeft: railCollapsed ? '96px' : '320px' }}
            >
              <div className="flex items-center gap-3 rounded-full border border-divider bg-white px-4 py-3 shadow-composer">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-slate-700 transition hover:bg-primary/10 focus:outline-none"
                  aria-label="Add attachment"
                >
                  <PaperClipIcon className="h-5 w-5" />
                </button>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask anything"
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 text-base leading-relaxed placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:outline-none"
                  disabled={state.isStreaming}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') {
                      return;
                    }
                    if (event.metaKey) {
                      event.preventDefault();
                      void sendDraft();
                      return;
                    }
                    if (event.shiftKey || event.altKey) {
                      return;
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <div ref={thinkingMenuRef} className="relative hidden sm:block">
                    <button
                      type="button"
                      onClick={() => setThinkingMenuOpen((prev) => !prev)}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Thinking mode"
                      aria-haspopup="menu"
                      aria-expanded={thinkingMenuOpen}
                      disabled={state.isStreaming}
                    >
                      Thinking: {THINKING_SETTING_LABELS[thinking]} ▾
                    </button>
                    {thinkingMenuOpen ? (
                      <div
                        role="menu"
                        className="absolute bottom-full right-0 mb-2 w-44 rounded-xl border border-divider bg-white p-1 shadow-lg"
                      >
                        {THINKING_SETTINGS.map((setting) => {
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
                                setThinking(setting);
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
                  {state.isStreaming ? (
                    <button
                      type="button"
                      onClick={interrupt}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600 shadow-sm transition hover:bg-red-100 focus:outline-none"
                      aria-label="Stop streaming"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={state.isStreaming || !draft.trim()}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Send message"
                  >
                    <ArrowUpIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="relative mt-2 flex items-center text-xs text-muted">
                <span className="mx-auto">⌘ + Enter to send · Shift + Enter adds a newline.</span>
                {state.isStreaming ? <span className="absolute right-0 animate-pulse text-primary">Streaming…</span> : null}
              </div>
            </div>
          </form>
        </div>
      </div>

      {showMergeModal ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Merge {displayBranchName(branchName)} into trunk
            </h3>
            <p className="text-sm text-muted">
              Summarize what to bring back and preview the Canvas diff. Canvas changes are never auto-applied.
            </p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="merge-summary">
                Merge summary
              </label>
              <textarea
                id="merge-summary"
                value={mergeSummary}
                onChange={(event) => setMergeSummary(event.target.value)}
                rows={4}
                placeholder="What should come back to trunk?"
                className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm leading-relaxed shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isMerging}
              />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-800">Canvas diff</span>
                {mergePreview && !hasCanvasChanges && !isMergePreviewLoading && !mergePreviewError ? (
                  <span className="text-xs text-muted">No changes detected</span>
                ) : null}
              </div>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-divider/80 bg-slate-50 font-mono text-xs text-slate-800">
                {isMergePreviewLoading ? (
                  <p className="px-3 py-2 text-sm text-muted">Loading Canvas diff…</p>
                ) : mergePreviewError ? (
                  <p className="px-3 py-2 text-sm text-red-600">{mergePreviewError}</p>
                ) : mergePreview ? (
                  hasCanvasChanges ? (
                    <div className="divide-y divide-slate-100">
                      {mergeDiff.map((line, idx) => {
                        const indicator = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
                        const palette =
                          line.type === 'added'
                            ? 'bg-emerald-50/70 text-emerald-900'
                            : line.type === 'removed'
                            ? 'bg-rose-50/80 text-rose-900'
                            : 'text-slate-700';
                        return (
                          <div key={`${line.type}-${idx}-${line.value}`} className={`flex gap-2 px-3 py-1.5 ${palette}`}>
                            <span className="w-3 text-center">{indicator}</span>
                            <span className="whitespace-pre-wrap break-words">{line.value === '' ? ' ' : line.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-sm text-muted">
                      No Canvas differences between {displayBranchName(branchName)} and trunk.
                    </p>
                  )
                ) : (
                  <p className="px-3 py-2 text-sm text-muted">Select a branch to preview.</p>
                )}
              </div>
            </div>
            {mergeError ? <p className="mt-3 text-sm text-red-600">{mergeError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isMerging) return;
                  setShowMergeModal(false);
                  setMergeSummary('');
                  setMergeError(null);
                }}
                className="rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                disabled={isMerging}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!mergeSummary.trim()) {
                    setMergeError('Merge summary is required.');
                    return;
                  }
                  setIsMerging(true);
                  setMergeError(null);
                  try {
                    const res = await fetch(`/api/projects/${project.id}/merge`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        sourceBranch: branchName,
                        targetBranch: trunkName,
                        mergeSummary: mergeSummary.trim()
                      })
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      throw new Error(data?.error?.message ?? 'Merge failed');
                    }
                    await Promise.all([mutateHistory(), mutateArtefact()]);
                    setShowMergeModal(false);
                    setMergeSummary('');
                  } catch (err) {
                    setMergeError((err as Error).message);
                  } finally {
                    setIsMerging(false);
                  }
                }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isMerging || isMergePreviewLoading}
              >
                {isMerging ? 'Merging…' : 'Merge into trunk'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && editingNode ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit message (new branch)</h3>
            <p className="text-sm text-muted">Editing creates a new branch from this message and switches you there.</p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="edit-branch-name">
                Branch name
              </label>
              <input
                id="edit-branch-name"
                value={editBranchName}
                onChange={(event) => setEditBranchName(event.target.value)}
                placeholder="feature/my-edit"
                className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isEditing}
                required
              />
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800">Updated content</label>
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm leading-relaxed shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isEditing}
              />
            </div>
            {editError ? <p className="mt-2 text-sm text-red-600">{editError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isEditing) return;
                  setShowEditModal(false);
                  setEditDraft('');
                  setEditBranchName('');
                  setEditingNode(null);
                  setEditError(null);
                }}
                className="rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                disabled={isEditing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!editDraft.trim()) {
                    setEditError('Content is required.');
                    return;
                  }
                  if (!editBranchName.trim()) {
                    setEditError('Branch name is required.');
                    return;
                  }
                  setIsEditing(true);
                  setEditError(null);
                  try {
                    const res = await fetch(`/api/projects/${project.id}/edit`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        content: editDraft.trim(),
                        branchName: editBranchName.trim(),
                        fromRef: branchName,
                        nodeId: editingNode?.id
                      })
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      throw new Error(data?.error?.message ?? 'Edit failed');
                    }
                    const data = (await res.json()) as { branchName: string };
                    setBranchName(data.branchName);
                    const branchesRes = await fetch(`/api/projects/${project.id}/branches`);
                    if (branchesRes.ok) {
                      const branchesData = (await branchesRes.json()) as { branches: BranchSummary[]; currentBranch: string };
                      setBranches(branchesData.branches);
                    }
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem(`researchtree:provider:${project.id}:${data.branchName}`, provider);
                      window.localStorage.setItem(`researchtree:thinking:${project.id}:${data.branchName}`, thinking);
                    }
                    await Promise.all([mutateHistory(), mutateArtefact()]);
                    setShowEditModal(false);
                    setEditDraft('');
                    setEditBranchName('');
                    setEditingNode(null);
                  } catch (err) {
                    setEditError((err as Error).message);
                  } finally {
                    setIsEditing(false);
                  }
                }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isEditing}
              >
                {isEditing ? 'Creating branch…' : 'Save & switch'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function buildLineDiff(base: string, incoming: string): DiffLine[] {
  const baseLines = base.length > 0 ? base.split(/\r?\n/) : [];
  const incomingLines = incoming.length > 0 ? incoming.split(/\r?\n/) : [];
  const m = baseLines.length;
  const n = incomingLines.length;
  if (m === 0 && n === 0) {
    return [];
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (baseLines[i] === incomingLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const diff: DiffLine[] = [];
  const pushLine = (type: DiffLine['type'], value: string) => {
    diff.push({ type, value });
  };
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (baseLines[i] === incomingLines[j]) {
      pushLine('context', baseLines[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushLine('removed', baseLines[i]);
      i += 1;
    } else {
      pushLine('added', incomingLines[j]);
      j += 1;
    }
  }
  while (i < m) {
    pushLine('removed', baseLines[i]);
    i += 1;
  }
  while (j < n) {
    pushLine('added', incomingLines[j]);
    j += 1;
  }
  return diff;
}
