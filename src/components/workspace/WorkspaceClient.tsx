'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { FormEvent } from 'react';
import type { ProjectMetadata, NodeRecord, BranchSummary, MessageNode } from '@git/types';
import type { LLMProvider } from '@/src/server/llm';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';
import { THINKING_SETTINGS, THINKING_SETTING_LABELS, type ThinkingSetting } from '@/src/shared/thinking';
import { getAllowedThinkingSettings, getDefaultModelForProviderFromCapabilities, getDefaultThinkingSetting } from '@/src/shared/llmCapabilities';
import { features } from '@/src/config/features';
import { storageKey } from '@/src/config/app';
import {
  deriveTextFromBlocks,
  deriveThinkingFromBlocks,
  getContentBlocksWithLegacyFallback,
  type ThinkingContentBlock
} from '@/src/shared/thinkingTraces';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import useSWR from 'swr';
import type { FC } from 'react';
import { RailPageLayout } from '@/src/components/layout/RailPageLayout';
import { BlueprintIcon } from '@/src/components/ui/BlueprintIcon';
import { WorkspaceGraph } from './WorkspaceGraph';
import { buildBranchColorMap, getBranchColor } from './branchColors';
import { InsightFrame } from './InsightFrame';
import { AuthRailStatus } from '@/src/components/auth/AuthRailStatus';
import { RailPopover } from '@/src/components/layout/RailPopover';
import { NewBranchFormCard } from '@/src/components/workspace/NewBranchFormCard';
import {
  ArrowUpIcon,
  CheckIcon,
  HomeIcon,
  PaperClipIcon,
  QuestionMarkCircleIcon,
  SearchIcon,
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

const normalizeProviderForUi = (provider: LLMProvider): LLMProvider => {
  return provider === 'openai_responses' ? 'openai' : provider;
};

const getNodeBlocks = (node: NodeRecord): ThinkingContentBlock[] => {
  return getContentBlocksWithLegacyFallback(node);
};

const getNodeText = (node: NodeRecord): string => {
  if (node.type !== 'message') return '';
  const blocks = getNodeBlocks(node);
  return deriveTextFromBlocks(blocks) || node.content;
};

const getNodeThinkingText = (node: NodeRecord): string => {
  if (node.type !== 'message') return '';
  const blocks = getNodeBlocks(node);
  return deriveThinkingFromBlocks(blocks);
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
  openAIUseResponses: boolean;
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
  highlighted?: boolean;
}> = ({
  node,
  muted = false,
  subtitle,
  isStarred = false,
  onToggleStar,
  onEdit,
  isCanvasDiffPinned = false,
  onPinCanvasDiff,
  highlighted = false
}) => {
  const isUser = node.type === 'message' && node.role === 'user';
  const isAssistantPending = node.type === 'message' && node.role === 'assistant' && node.id === 'assistant-pending';
  const messageText = getNodeText(node);
  const thinkingText = getNodeThinkingText(node);
  const canCopy = node.type === 'message' && messageText.length > 0;
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCanvasDiff, setShowCanvasDiff] = useState(false);
  const [confirmPinCanvasDiff, setConfirmPinCanvasDiff] = useState(false);
  const [pinCanvasDiffError, setPinCanvasDiffError] = useState<string | null>(null);
  const [isPinningCanvasDiff, setIsPinningCanvasDiff] = useState(false);
  const [showMergePayload, setShowMergePayload] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const isAssistant = node.type === 'message' && node.role === 'assistant';
  const hasThinking = isAssistant && thinkingText.trim().length > 0;
  const showThinkingBox = isAssistantPending || hasThinking;
  const thinkingInProgress = isAssistantPending || (node.id === 'streaming' && messageText.length === 0);
  const containerWidth = isAssistant ? 'w-full' : '';
  const width = isUser ? 'min-w-[14rem] max-w-[82%]' : isAssistant ? 'w-full max-w-[85%]' : 'max-w-[82%]';
  const base = `relative ${width} overflow-hidden rounded-2xl px-4 py-3 transition`;
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
    <article className={`flex flex-col gap-1 ${align} ${containerWidth}`}>
      <div className={`${base} ${palette} ${highlighted ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-white' : ''}`}>
        {showThinkingBox ? (
          <div
            className={`mb-3 w-full rounded-xl border border-slate-200/70 bg-slate-50 ${
              showThinking ? 'p-3' : 'px-3 py-2'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span className="flex items-center gap-2 font-semibold text-slate-700">
                {thinkingInProgress ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary/70" />
                ) : null}
                Thinking
              </span>
              {hasThinking ? (
                <button
                  type="button"
                  onClick={() => setShowThinking((prev) => !prev)}
                  className="rounded-full border border-divider/70 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-primary/10"
                  aria-label={showThinking ? 'Hide thinking' : 'Show thinking'}
                >
                  {showThinking ? 'Hide' : 'Show'}
                </button>
              ) : null}
            </div>
            {showThinking && hasThinking ? (
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{thinkingText}</p>
            ) : null}
          </div>
        ) : null}
        {node.type === 'message' && messageText ? (
          isAssistant ? (
            <div className="prose prose-sm prose-slate mt-2 max-w-none break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText}</ReactMarkdown>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-800">{messageText}</p>
          )
        ) : null}
        {node.type === 'state' ? <p className="mt-2 text-sm font-medium text-slate-700">Canvas updated</p> : null}
        {node.type === 'merge' ? (
          <div className="mt-2 space-y-1">
            <p className="text-sm font-medium text-slate-700">
              Merged from <span className="font-semibold">{node.mergeFrom}</span>
            </p>
            <p className="text-sm font-medium text-slate-700">{node.mergeSummary}</p>
            <p className="text-xs text-slate-500">This merge summary is included in future LLM context.</p>
          </div>
        ) : null}

        {node.type === 'merge' ? (
          node.mergedAssistantContent?.trim() ? (
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Merged payload</span>
                <button
                  type="button"
                  onClick={() => setShowMergePayload((prev) => !prev)}
                  className="rounded-full border border-divider/70 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-primary/10"
                  aria-label={showMergePayload ? 'Hide merged payload' : 'Show merged payload'}
                >
                  {showMergePayload ? 'Hide' : 'Show'}
                </button>
              </div>
              {showMergePayload ? (
                <div className="prose prose-sm prose-slate mt-2 max-w-none break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.mergedAssistantContent}</ReactMarkdown>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-800">
                  {`${node.mergedAssistantContent.slice(0, 280)}${node.mergedAssistantContent.length > 280 ? '…' : ''}`}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm italic text-slate-500">Merged payload unavailable (legacy merge)</p>
          )
        ) : null}
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

        <div className={`mt-3 flex flex-nowrap items-center gap-2 text-xs text-muted ${isUser ? 'justify-end' : 'justify-start'}`}>
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
                  await copyToClipboard(messageText);
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
          {node.type === 'message' &&
          onEdit &&
          (node.role === 'user' || node.role === 'assistant' || features.uiEditAnyMessage) ? (
            <button
              type="button"
              data-branch-trigger={node.role === 'assistant' ? 'true' : undefined}
              onClick={() => onEdit(node)}
              className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 hover:bg-primary/10 hover:text-primary focus:outline-none"
              aria-label={node.role === 'assistant' ? 'Create branch from message' : 'Edit message'}
            >
              <BlueprintIcon icon="git-new-branch" className="h-4 w-4" />
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
  branchColors?: Record<string, string>;
  muted?: boolean;
  subtitle?: string;
  messageInsetClassName?: string;
  isStarred?: boolean;
  onToggleStar?: () => void;
  onEdit?: (node: MessageNode) => void;
  isCanvasDiffPinned?: boolean;
  onPinCanvasDiff?: (mergeNodeId: string) => Promise<void>;
  highlighted?: boolean;
  showBranchSplit?: boolean;
}> = ({
  node,
  trunkName,
  branchColors,
  muted,
  subtitle,
  messageInsetClassName,
  isStarred,
  onToggleStar,
  onEdit,
  isCanvasDiffPinned,
  onPinCanvasDiff,
  highlighted,
  showBranchSplit
}) => {
  const isUser = node.type === 'message' && node.role === 'user';
  const stripeColor = getBranchColor(node.createdOnBranch ?? trunkName, trunkName, branchColors);

  return (
    <div className="grid min-w-0 grid-cols-[14px_1fr] items-stretch" data-node-id={node.id}>
      <div className="flex justify-center">
        <div
          data-testid="chat-row-stripe"
          className="h-full w-1"
          style={{ backgroundColor: stripeColor, opacity: 0.9 }}
        />
      </div>
      <div
        className={`min-w-0 py-2 ${messageInsetClassName ?? ''} ${isUser ? 'flex justify-end' : 'flex justify-start'}`}
      >
        <div className="flex w-full flex-col">
          <NodeBubble
            node={node}
            muted={muted}
            subtitle={subtitle}
            isStarred={isStarred}
            onToggleStar={onToggleStar}
            onEdit={onEdit}
            isCanvasDiffPinned={isCanvasDiffPinned}
            onPinCanvasDiff={onPinCanvasDiff}
            highlighted={!!highlighted}
          />
          {showBranchSplit ? (
            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              <span className="flex-1 border-t border-dashed border-slate-200" />
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">Branch point</span>
              <span className="flex-1 border-t border-dashed border-slate-200" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export function WorkspaceClient({
  project,
  initialBranches,
  defaultProvider,
  providerOptions,
  openAIUseResponses
}: WorkspaceClientProps) {
  const CHAT_WIDTH_KEY = storageKey(`chat-width:${project.id}`);
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
  const [mergePreview, setMergePreview] = useState<{ target: string; source: string } | null>(null);
  const [isMergePreviewLoading, setIsMergePreviewLoading] = useState(false);
  const [mergePreviewError, setMergePreviewError] = useState<string | null>(null);
  const [mergePayloadNodeId, setMergePayloadNodeId] = useState<string | null>(null);
  const [showMergePayloadPicker, setShowMergePayloadPicker] = useState(false);
  const [mergeTargetBranch, setMergeTargetBranch] = useState<string>('main');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNode, setEditingNode] = useState<MessageNode | null>(null);
  const [branchSplitNodeId, setBranchSplitNodeId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editBranchName, setEditBranchName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editProvider, setEditProvider] = useState<LLMProvider>(normalizeProviderForUi(defaultProvider));
  const [editThinking, setEditThinking] = useState<ThinkingSetting>('medium');
  const [artefactDraft, setArtefactDraft] = useState('');
  const [isSavingArtefact, setIsSavingArtefact] = useState(false);
  const [artefactError, setArtefactError] = useState<string | null>(null);
  const [newBranchProvider, setNewBranchProvider] = useState<LLMProvider>(normalizeProviderForUi(defaultProvider));
  const [newBranchThinking, setNewBranchThinking] = useState<ThinkingSetting>('medium');
  const autosaveControllerRef = useRef<AbortController | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSavingTokenRef = useRef(0);
  const autosaveSpinnerUntilRef = useRef<number | null>(null);
  const autosaveSpinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [insightTab, setInsightTab] = useState<'graph' | 'canvas'>('graph');
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState<string | null>(null);
  const [graphDetailError, setGraphDetailError] = useState<string | null>(null);
  const [isGraphDetailBusy, setIsGraphDetailBusy] = useState(false);
  const [confirmGraphAddCanvas, setConfirmGraphAddCanvas] = useState(false);
  const [isCanvasFocused, setIsCanvasFocused] = useState(false);
  const [graphCopyFeedback, setGraphCopyFeedback] = useState(false);
  const graphCopyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [insightCollapsed, setInsightCollapsed] = useState(false);
  const [chatPaneWidth, setChatPaneWidth] = useState<number | null>(null);
  const [insightPaneWidth, setInsightPaneWidth] = useState<number | null>(null);
  const paneContainerRef = useRef<HTMLDivElement | null>(null);
  const insightPaneRef = useRef<HTMLDivElement | null>(null);
  const isResizingRef = useRef(false);
  const savedChatPaneWidthRef = useRef<number | null>(null);
  const [graphHistories, setGraphHistories] = useState<Record<string, NodeRecord[]> | null>(null);
  const [graphHistoryError, setGraphHistoryError] = useState<string | null>(null);
  const [graphHistoryLoading, setGraphHistoryLoading] = useState(false);
  const [graphMode, setGraphMode] = useState<'nodes' | 'collapsed' | 'starred'>('collapsed');
  const [composerPadding, setComposerPadding] = useState(128);
  const isGraphVisible = !insightCollapsed && insightTab === 'graph';
  const collapseInsights = useCallback(() => {
    savedChatPaneWidthRef.current = chatPaneWidth;
    setChatPaneWidth(null);
    setInsightCollapsed(true);
  }, [chatPaneWidth]);
  const expandInsights = useCallback(() => {
    setInsightCollapsed(false);
    if (savedChatPaneWidthRef.current) {
      setChatPaneWidth(savedChatPaneWidthRef.current);
    }
  }, []);
  const INSIGHT_MIN_WIDTH = 360;
  const INSIGHT_COLLAPSED_WIDTH = 56;
  const SPLIT_GAP = 12;
  const composerRef = useRef<HTMLDivElement | null>(null);
  const openEditModal = (node: MessageNode) => {
    if (node.role === 'assistant') {
      if (showNewBranchPopover && branchSplitNodeId === node.id) {
        setShowNewBranchPopover(false);
        setBranchSplitNodeId(null);
        return;
      }
      setBranchActionError(null);
      setNewBranchName('');
      setBranchSplitNodeId(node.id);
      setShowNewBranchPopover(true);
      return;
    }
    setBranchSplitNodeId(null);
    setEditingNode(node);
    setEditDraft(node.content);
    setEditBranchName('');
    setEditError(null);
    setEditProvider(normalizeProviderForUi(branchProvider));
    setEditThinking(thinking);
    setShowEditModal(true);
  };

  const {
    data: starsData,
    mutate: mutateStars
  } = useSWR<{ starredNodeIds: string[] }>(`/api/projects/${project.id}/stars`, fetchJson, { revalidateOnFocus: true });

  const starredNodeIds = starsData?.starredNodeIds ?? [];
  const starredKey = useMemo(() => [...new Set(starredNodeIds)].sort().join('|'), [starredNodeIds]);
  const stableStarredNodeIds = useMemo(() => (starredKey ? starredKey.split('|') : []), [starredKey]);
  const starredSet = useMemo(() => new Set(stableStarredNodeIds), [stableStarredNodeIds]);

  const toggleStar = async (nodeId: string) => {
    const prev = stableStarredNodeIds;
    const next = starredSet.has(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId];
    const optimistic = [...new Set(next)].sort();
    await mutateStars({ starredNodeIds: optimistic }, false);
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
      const canonical = [...new Set(data.starredNodeIds ?? [])].sort();
      if (canonical.join('|') !== optimistic.join('|')) {
        await mutateStars({ starredNodeIds: canonical }, false);
      }
    } catch {
      await mutateStars({ starredNodeIds: prev }, false);
    }
  };

  const copyTextToClipboard = async (text: string) => {
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
  const { nodes, artefact, artefactMeta, isLoading, error, mutateHistory, mutateArtefact } = useProjectData(project.id, {
    ref: branchName
  });
  const hasSentMessage = useMemo(
    () => nodes.some((node) => node.type === 'message' && node.role === 'user'),
    [nodes]
  );
  const isNewUser = !hasSentMessage;
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const refreshHistory = useCallback(async () => {
    await mutateHistory();
    setHistoryEpoch((value) => value + 1);
  }, [mutateHistory]);
  const draftStorageKey = `researchtree:draft:${project.id}`;
  const [draft, setDraft] = useState('');
  const [optimisticUserNode, setOptimisticUserNode] = useState<NodeRecord | null>(null);
  const optimisticDraftRef = useRef<string | null>(null);
  const [assistantPending, setAssistantPending] = useState(false);
  const assistantPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [streamBlocks, setStreamBlocks] = useState<ThinkingContentBlock[]>([]);
  const hasReceivedAssistantChunkRef = useRef(false);
  const [streamPreview, setStreamPreview] = useState('');
  const streamPreviewRef = useRef('');
  const activeBranch = useMemo(() => branches.find((branch) => branch.name === branchName), [branches, branchName]);
  const branchProvider = useMemo(
    () => activeBranch?.provider ?? defaultProvider,
    [activeBranch?.provider, defaultProvider]
  );
  const branchModel = useMemo(() => {
    const option = providerOptions.find((entry) => entry.id === branchProvider);
    return activeBranch?.model ?? option?.defaultModel ?? getDefaultModelForProviderFromCapabilities(branchProvider);
  }, [activeBranch?.model, branchProvider, providerOptions]);
  const [thinking, setThinking] = useState<ThinkingSetting>('medium');
  const thinkingStorageKey = useMemo(
    () => `researchtree:thinking:${project.id}:${branchName}`,
    [project.id, branchName]
  );
  const [thinkingHydratedKey, setThinkingHydratedKey] = useState<string | null>(null);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const thinkingMenuRef = useRef<HTMLDivElement | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const webSearchStorageKey = useMemo(
    () => `researchtree:websearch:${project.id}:${branchName}`,
    [project.id, branchName]
  );
  const [webSearchHydratedKey, setWebSearchHydratedKey] = useState<string | null>(null);

  const { sendMessage, interrupt, state } = useChatStream({
    projectId: project.id,
    ref: branchName,
    provider: branchProvider,
    thinking,
    webSearch: webSearchEnabled,
    onChunk: (chunk) => {
      if (!hasReceivedAssistantChunkRef.current) {
        hasReceivedAssistantChunkRef.current = true;
        if (assistantPendingTimerRef.current) {
          clearTimeout(assistantPendingTimerRef.current);
          assistantPendingTimerRef.current = null;
        }
        setAssistantPending(false);
        shouldScrollToBottomRef.current = true;
      }
      if (chunk.type === 'thinking') {
        setStreamBlocks((prev) => {
          const last = prev[prev.length - 1];
          if (chunk.append && last?.type === 'thinking' && typeof (last as { thinking?: unknown }).thinking === 'string') {
            const updated = { ...last, thinking: `${(last as { thinking: string }).thinking}${chunk.content}` };
            return [...prev.slice(0, -1), updated];
          }
          return [
            ...prev,
            {
              type: 'thinking',
              thinking: chunk.content
            }
          ];
        });
        return;
      }
      if (chunk.type === 'thinking_signature') {
        setStreamBlocks((prev) => [
          ...prev,
          {
            type: 'thinking_signature',
            signature: chunk.content
          }
        ]);
        return;
      }
      setStreamBlocks((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === 'text' && typeof (last as { text?: unknown }).text === 'string') {
          const updated = { ...last, text: `${(last as { text: string }).text}${chunk.content}` };
          return [...prev.slice(0, -1), updated];
        }
        return [...prev, { type: 'text', text: chunk.content }];
      });
      setStreamPreview((prev) => {
        const incoming = chunk.content ?? '';
        const next = prev + incoming;
        streamPreviewRef.current = next;
        return next;
      });
    },
    onComplete: async () => {
      await Promise.all([refreshHistory(), mutateArtefact()]);
      setStreamPreview('');
      streamPreviewRef.current = '';
      setStreamBlocks([]);
      setOptimisticUserNode(null);
      optimisticDraftRef.current = null;
      hasReceivedAssistantChunkRef.current = false;
      if (assistantPendingTimerRef.current) {
        clearTimeout(assistantPendingTimerRef.current);
        assistantPendingTimerRef.current = null;
      }
      setAssistantPending(false);
    }
  });

  const activeProvider = useMemo(
    () => providerOptions.find((option) => option.id === branchProvider),
    [branchProvider, providerOptions]
  );
  const selectableProviderOptions = useMemo(
    () => providerOptions.filter((option) => option.id !== 'openai_responses'),
    [providerOptions]
  );
  const branchProviderLabel = activeProvider?.label ?? (branchProvider === 'openai_responses' ? 'OpenAI' : branchProvider);

  const activeProviderModel = branchModel;
  const allowedThinking = useMemo(
    () => getAllowedThinkingSettings(branchProvider, activeProviderModel),
    [branchProvider, activeProviderModel]
  );
  const thinkingUnsupportedError =
    !activeProviderModel || allowedThinking.includes(thinking)
      ? null
      : `Thinking: ${THINKING_SETTING_LABELS[thinking]} is not supported for ${branchProviderLabel} (model=${activeProviderModel}).`;
  const webSearchAvailable = branchProvider !== 'mock';
  const showOpenAISearchNote =
    webSearchEnabled &&
    !openAIUseResponses &&
    (branchProvider === 'openai' || branchProvider === 'openai_responses');

  const sendDraft = async () => {
    if (!draft.trim() || state.isStreaming) return;
    if (thinkingUnsupportedError) {
      setThinkingMenuOpen(true);
      return;
    }
    shouldScrollToBottomRef.current = true;
    const sent = draft;
    optimisticDraftRef.current = sent;
    setDraft('');
    setStreamBlocks([]);
    hasReceivedAssistantChunkRef.current = false;
    if (assistantPendingTimerRef.current) {
      clearTimeout(assistantPendingTimerRef.current);
      assistantPendingTimerRef.current = null;
    }
    setAssistantPending(false);
    setOptimisticUserNode({
      id: 'optimistic-user',
      type: 'message',
      role: 'user',
      content: sent,
      contentBlocks: [{ type: 'text', text: sent }],
      timestamp: Date.now(),
      parent: visibleNodes.length > 0 ? String(visibleNodes[visibleNodes.length - 1]!.id) : null,
      createdOnBranch: branchName
    });
    assistantPendingTimerRef.current = setTimeout(() => {
      setAssistantPending(true);
      assistantPendingTimerRef.current = null;
    }, 100);
    await sendMessage(sent);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendDraft();
  };

  const assistantPendingNode: NodeRecord | null =
    assistantPending && optimisticUserNode && streamPreview.length === 0
      ? {
          id: 'assistant-pending',
          type: 'message',
          role: 'assistant',
          content: '',
          contentBlocks: [],
          timestamp: Date.now(),
          parent: optimisticUserNode.id,
          interrupted: false,
          createdOnBranch: branchName
        }
      : null;

  const streamingNode: NodeRecord | null =
    streamPreview.length > 0 || streamBlocks.length > 0
      ? {
          id: 'streaming',
          type: 'message',
          role: 'assistant',
          content: streamPreview,
          contentBlocks: streamBlocks,
          timestamp: Date.now(),
          parent: optimisticUserNode?.id ?? null,
          createdOnBranch: optimisticUserNode?.createdOnBranch ?? branchName,
          interrupted: state.error !== null
        }
      : null;

  useEffect(() => {
    if (!state.error || !optimisticDraftRef.current) return;
    const sent = optimisticDraftRef.current;
    optimisticDraftRef.current = null;
    void Promise.all([refreshHistory(), mutateArtefact()]).catch(() => {});
    setOptimisticUserNode(null);
    setStreamPreview('');
    setStreamBlocks([]);
    if (!hasReceivedAssistantChunkRef.current) {
      setDraft(sent);
    }
    hasReceivedAssistantChunkRef.current = false;
    if (assistantPendingTimerRef.current) {
      clearTimeout(assistantPendingTimerRef.current);
      assistantPendingTimerRef.current = null;
    }
    setAssistantPending(false);
  }, [state.error, mutateArtefact, refreshHistory]);

  useEffect(() => {
    return () => {
      if (assistantPendingTimerRef.current) {
        clearTimeout(assistantPendingTimerRef.current);
        assistantPendingTimerRef.current = null;
      }
    };
  }, []);

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
    const defaultThinking = getDefaultThinkingSetting(branchProvider, activeProviderModel);
    const allowed = activeProviderModel
      ? getAllowedThinkingSettings(branchProvider, activeProviderModel)
      : THINKING_SETTINGS;
    const isValid = saved && (THINKING_SETTINGS as readonly string[]).includes(saved) && allowed.includes(saved as ThinkingSetting);
    setThinking(isValid ? (saved as ThinkingSetting) : defaultThinking);
    setThinkingHydratedKey(thinkingStorageKey);
  }, [thinkingStorageKey, branchProvider, activeProviderModel]);

  useEffect(() => {
    if (!activeProviderModel) return;
    if (allowedThinking.includes(thinking)) return;
    setThinking(getDefaultThinkingSetting(branchProvider, activeProviderModel));
  }, [allowedThinking, thinking, branchProvider, activeProviderModel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (thinkingHydratedKey !== thinkingStorageKey) return;
    window.localStorage.setItem(thinkingStorageKey, thinking);
  }, [thinking, thinkingHydratedKey, thinkingStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setWebSearchHydratedKey(null);
    const saved = window.localStorage.getItem(webSearchStorageKey);
    setWebSearchEnabled(saved === 'true');
    setWebSearchHydratedKey(webSearchStorageKey);
  }, [webSearchStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (webSearchHydratedKey !== webSearchStorageKey) return;
    window.localStorage.setItem(webSearchStorageKey, webSearchEnabled ? 'true' : 'false');
  }, [webSearchEnabled, webSearchHydratedKey, webSearchStorageKey]);

  useEffect(() => {
    if (!showEditModal) return;
    const editModel = providerOptions.find((option) => option.id === editProvider)?.defaultModel ?? '';
    if (!editModel) return;
    const allowed = getAllowedThinkingSettings(editProvider, editModel);
    if (allowed.includes(editThinking)) return;
    setEditThinking(getDefaultThinkingSetting(editProvider, editModel));
  }, [showEditModal, editProvider, editThinking, providerOptions]);

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
    const container = paneContainerRef.current;
    if (!container || !chatPaneWidth) return;
    const rect = container.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return;
    const rightMin = insightCollapsed ? INSIGHT_COLLAPSED_WIDTH : INSIGHT_MIN_WIDTH;
    const nextWidth = Math.max(rightMin, Math.floor(rect.width - chatPaneWidth - SPLIT_GAP));
    setInsightPaneWidth(nextWidth);
  }, [chatPaneWidth, insightCollapsed]);

  useEffect(() => {
    if (chatPaneWidth || insightPaneWidth || insightCollapsed) return;
    const panel = insightPaneRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return;
    setInsightPaneWidth(Math.max(INSIGHT_MIN_WIDTH, Math.floor(rect.width)));
  }, [chatPaneWidth, insightPaneWidth, insightCollapsed]);

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

      const rightMin = insightCollapsed ? INSIGHT_COLLAPSED_WIDTH : INSIGHT_MIN_WIDTH;
      const minChat = 380;
      const maxChat = Math.max(minChat, rect.width - rightMin - SPLIT_GAP);
      const next = Math.min(maxChat, Math.max(minChat, clientX - rect.left));
      setChatPaneWidth(Math.round(next));
      setInsightPaneWidth(Math.floor(rect.width - next - SPLIT_GAP));
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
    if (newBranchName.trim()) return;
    setNewBranchProvider(normalizeProviderForUi(branchProvider));
    setNewBranchThinking(thinking);
  }, [branchProvider, thinking, newBranchName]);

  useEffect(() => {
    setArtefactDraft(artefact);
  }, [artefact]);

  const trunkName = useMemo(() => branches.find((b) => b.isTrunk)?.name ?? 'main', [branches]);
  const displayBranchName = (name: string) => (name === trunkName ? 'trunk' : name);
  const sortedBranches = branches;
  const branchColorMap = useMemo(
    () => buildBranchColorMap(sortedBranches.map((branch) => branch.name), trunkName),
    [sortedBranches, trunkName]
  );
  const graphRequestKey = useMemo(() => sortedBranches.map((b) => b.name).sort().join('|'), [sortedBranches]);
  const lastGraphRequestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (insightCollapsed || insightTab !== 'graph') return;
    if (graphHistories && lastGraphRequestKeyRef.current === graphRequestKey && !graphHistoryError) {
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setGraphHistoryLoading(true);
      setGraphHistoryError(null);
      try {
        const res = await fetch(`/api/projects/${project.id}/graph`, { signal: controller.signal });
        if (!res.ok) {
          throw new Error('Failed to load graph');
        }
        const data = (await res.json()) as { branchHistories?: Record<string, NodeRecord[]> };
        setGraphHistories(data.branchHistories ?? {});
        lastGraphRequestKeyRef.current = graphRequestKey;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setGraphHistoryError((err as Error).message);
      } finally {
        setGraphHistoryLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [insightCollapsed, insightTab, graphRequestKey, project.id, graphHistories, graphHistoryError]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = Math.max(116, Math.ceil(composer.offsetHeight + 24));
      setComposerPadding(next);
    });
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isGraphVisible) return;
    setGraphHistories((prev) => {
      if (!prev) return prev;
      const MAX_PER_BRANCH = 500;
      const nextNodes =
        nodes.length <= MAX_PER_BRANCH ? nodes : [nodes[0]!, ...nodes.slice(-(MAX_PER_BRANCH - 1))];
      const current = prev[branchName];
      if (current === nextNodes) return prev;
      // Avoid thrashing the graph when the active history hasn't changed meaningfully.
      if (current && current.length === nextNodes.length && current[current.length - 1]?.id === nextNodes[nextNodes.length - 1]?.id) {
        return prev;
      }
      return { ...prev, [branchName]: nextNodes };
    });
  }, [isGraphVisible, branchName, nodes]);

  useEffect(() => {
    if (insightTab !== 'graph') {
      setSelectedGraphNodeId(null);
    }
  }, [insightTab]);

  useEffect(() => {
    setGraphDetailError(null);
    setIsGraphDetailBusy(false);
    setConfirmGraphAddCanvas(false);
    setGraphCopyFeedback(false);
    if (graphCopyFeedbackTimeoutRef.current) {
      clearTimeout(graphCopyFeedbackTimeoutRef.current);
      graphCopyFeedbackTimeoutRef.current = null;
    }
  }, [selectedGraphNodeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        setInsightTab('graph');
        return;
      }
      if (event.key === 'ArrowRight') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        setInsightTab('canvas');
        return;
      }
      if (event.key === 'ArrowDown') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (!insightCollapsed) {
          event.preventDefault();
          collapseInsights();
        }
        return;
      }
      if (event.key === 'ArrowUp') {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (insightCollapsed) {
          event.preventDefault();
          expandInsights();
        }
        return;
      }
      if (event.key === 'Escape') {
        setSelectedGraphNodeId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapseInsights, expandInsights, insightCollapsed]);

  useEffect(() => {
    return () => {
      if (graphCopyFeedbackTimeoutRef.current) {
        clearTimeout(graphCopyFeedbackTimeoutRef.current);
        graphCopyFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

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
  }, [artefactDraft, artefact, branchName, trunkName, project.id, mutateArtefact]);

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
          fetch(`${baseUrl}?ref=${encodeURIComponent(mergeTargetBranch)}`, { signal: controller.signal }),
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
          target: trunkPayload?.artefact ?? '',
          source: branchPayload?.artefact ?? ''
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
  }, [showMergeModal, branchName, mergeTargetBranch, project.id]);

  const [showHints, setShowHints] = useState(false);
  const autoOpenedHintsRef = useRef(false);
  const hintsRef = useRef<HTMLDivElement | null>(null);
  const hintsButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showNewBranchPopover, setShowNewBranchPopover] = useState(false);
  const newBranchPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isLoading || !isNewUser || autoOpenedHintsRef.current) return;
    setShowHints(true);
    autoOpenedHintsRef.current = true;
  }, [isLoading, isNewUser]);

  useEffect(() => {
    if (!showHints) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (hintsRef.current?.contains(target)) return;
      setShowHints(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowHints(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showHints]);

  useEffect(() => {
    if (!showNewBranchPopover) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-branch-trigger="true"]')) return;
      if (newBranchPopoverRef.current?.contains(target)) return;
      setShowNewBranchPopover(false);
      setBranchSplitNodeId(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowNewBranchPopover(false);
        setBranchSplitNodeId(null);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showNewBranchPopover]);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const scrollFollowThreshold = 72;
  const previousVisibleCountRef = useRef(0);
  const previousVisibleBranchRef = useRef<string | null>(null);
  const [pendingScrollTo, setPendingScrollTo] = useState<{ nodeId: string; targetBranch: string } | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const combinedNodes = useMemo(() => {
    const out: NodeRecord[] = [...nodes];
    if (optimisticUserNode) {
      out.push(optimisticUserNode);
    }
    if (assistantPendingNode) {
      out.push(assistantPendingNode);
    }
    if (streamingNode) {
      out.push(streamingNode);
    }
    return out;
  }, [nodes, optimisticUserNode, assistantPendingNode, streamingNode]);
  const visibleNodes = useMemo(() => combinedNodes.filter((node) => node.type !== 'state'), [combinedNodes]);
  const persistedNodesRef = useRef<NodeRecord[]>([]);
  persistedNodesRef.current = nodes.filter((node) => node.type !== 'state');

  useEffect(() => {
    if (previousVisibleBranchRef.current !== branchName) {
      previousVisibleBranchRef.current = branchName;
      previousVisibleCountRef.current = visibleNodes.length;
      return;
    }
    if (visibleNodes.length > previousVisibleCountRef.current) {
      const el = messageListRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
    previousVisibleCountRef.current = visibleNodes.length;
  }, [visibleNodes.length, branchName]);
  const lastUpdatedTimestamp = useMemo(() => {
    const historyLatest = visibleNodes[visibleNodes.length - 1]?.timestamp ?? null;
    const artefactUpdated = artefactMeta?.lastUpdatedAt ?? null;
    return historyLatest && artefactUpdated ? Math.max(historyLatest, artefactUpdated) : historyLatest ?? artefactUpdated;
  }, [visibleNodes, artefactMeta]);

  const mergeDiff = useMemo<DiffLine[]>(() => {
    if (!mergePreview) {
      return [];
    }
    return buildLineDiff(mergePreview.target, mergePreview.source);
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
    if (state.isStreaming) {
      return;
    }
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

    const aborted = { current: false };
    const timeoutId = setTimeout(() => {
      // Debounce shared-count recompute to coalesce rapid post-stream history updates.
      if (aborted.current) {
        return;
      }
      void (async () => {
        const persistedNodes = persistedNodesRef.current;
        const trunkNodes = trunkHistory?.nodes?.filter((node) => node.type !== 'state') ?? [];
        const trunkPrefix =
          trunkNodes.length > 0 ? prefixLength(trunkNodes, persistedNodes) : Math.min(trunkNodeCount, persistedNodes.length);
        setSharedCount(trunkPrefix);

        const others = branches.filter((b) => b.name !== branchName);
        if (others.length === 0) return;
        const histories = await Promise.all(
          others.map(async (b) => {
            try {
              const res = await fetch(
                `/api/projects/${project.id}/history?ref=${encodeURIComponent(b.name)}&limit=${persistedNodes.length}`
              );
              if (!res.ok) return null;
              const data = (await res.json()) as { nodes: NodeRecord[] };
              return { name: b.name, nodes: (data.nodes ?? []).filter((node) => node.type !== 'state') };
            } catch {
              return null;
            }
          })
        );
        const longest = histories.reduce((max, entry) => {
          if (!entry) return max;
          const min = Math.min(entry.nodes.length, persistedNodes.length);
          let idx = 0;
          while (idx < min && entry.nodes[idx]?.id === persistedNodes[idx]?.id) {
            idx += 1;
          }
          return Math.max(max, idx);
        }, trunkPrefix);
        if (!aborted.current) {
          setSharedCount(longest);
        }
      })();
    }, 150);
    return () => {
      aborted.current = true;
      clearTimeout(timeoutId);
    };
  }, [branchName, trunkName, trunkHistory, trunkNodeCount, branches, project.id, historyEpoch, state.isStreaming]);
  const [hideShared, setHideShared] = useState(branchName !== trunkName);
  useEffect(() => {
    setHideShared(branchName !== trunkName);
  }, [branchName, trunkName]);
  const { sharedNodes, branchNodes } = useMemo(() => {
    const shared = visibleNodes.slice(0, sharedCount);
    return {
      sharedNodes: shared,
      branchNodes: visibleNodes.slice(sharedCount)
    };
  }, [visibleNodes, sharedCount]);

  const mergePayloadCandidates = useMemo(() => {
    return branchNodes.filter(
      (node) =>
        node.type === 'message' &&
        node.role === 'assistant' &&
        node.id !== 'streaming' &&
        getNodeText(node).trim().length > 0 &&
        (node.createdOnBranch ? node.createdOnBranch === branchName : true)
    ) as MessageNode[];
  }, [branchNodes, branchName]);

  const selectedMergePayload = useMemo(() => {
    if (mergePayloadCandidates.length === 0) return null;
    if (mergePayloadNodeId) {
      const found = mergePayloadCandidates.find((node) => node.id === mergePayloadNodeId);
      if (found) return found;
    }
    return mergePayloadCandidates[mergePayloadCandidates.length - 1] ?? null;
  }, [mergePayloadCandidates, mergePayloadNodeId]);

  useEffect(() => {
    if (!showMergeModal) {
      setMergePayloadNodeId(null);
      setShowMergePayloadPicker(false);
      setMergeTargetBranch(trunkName);
      return;
    }
    const desiredDefault =
      branchName === trunkName
        ? branches.find((b) => b.name !== branchName)?.name ?? trunkName
        : trunkName;
    setMergeTargetBranch((prev) => {
      if (prev && prev !== branchName && branches.some((b) => b.name === prev)) {
        return prev;
      }
      if (desiredDefault !== branchName && branches.some((b) => b.name === desiredDefault)) {
        return desiredDefault;
      }
      return branches.find((b) => b.name !== branchName)?.name ?? trunkName;
    });
    if (mergePayloadCandidates.length === 0) {
      setMergePayloadNodeId(null);
      return;
    }
    if (mergePayloadNodeId && mergePayloadCandidates.some((node) => node.id === mergePayloadNodeId)) {
      return;
    }
    setMergePayloadNodeId(mergePayloadCandidates[mergePayloadCandidates.length - 1]?.id ?? null);
  }, [showMergeModal, mergePayloadCandidates, mergePayloadNodeId, trunkName, branchName, branches]);

  const pinnedCanvasDiffMergeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of visibleNodes) {
      if (node.type === 'message' && node.pinnedFromMergeId) {
        ids.add(node.pinnedFromMergeId);
      }
    }
    return ids;
  }, [visibleNodes]);

  const pinCanvasDiffToContext = async (mergeNodeId: string, targetBranch: string) => {
    const res = await fetch(`/api/projects/${project.id}/merge/pin-canvas-diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mergeNodeId, targetBranch })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error?.message ?? 'Failed to add diff to context');
    }
    return (await res.json().catch(() => null)) as { pinnedNode?: NodeRecord; alreadyPinned?: boolean } | null;
  };

  const pinCanvasDiffToCurrentBranch = async (mergeNodeId: string) => {
    await pinCanvasDiffToContext(mergeNodeId, branchName);
    await refreshHistory();
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingScrollTo) return;
    if (branchName !== pendingScrollTo.targetBranch) return;
    if (!nodes.some((node) => node.id === pendingScrollTo.nodeId)) return;
    const container = messageListRef.current;
    if (!container) return;

    const escapeSelector = (value: string) => {
      if (typeof (globalThis as any).CSS?.escape === 'function') {
        return (globalThis as any).CSS.escape(value);
      }
      return value.replace(/["\\]/g, '\\$&');
    };

    if (hideShared && sharedNodes.some((node) => node.id === pendingScrollTo.nodeId)) {
      // Ensure the target node is actually rendered before attempting to scroll.
      setHideShared(false);
      return;
    }

    requestAnimationFrame(() => {
      const el = container.querySelector(`[data-node-id="${escapeSelector(pendingScrollTo.nodeId)}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: 'center' });
      }
      setHighlightedNodeId(pendingScrollTo.nodeId);
      setPendingScrollTo(null);
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedNodeId(null);
      }, 2500);
    });
  }, [pendingScrollTo, branchName, nodes, hideShared, sharedNodes]);

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
		  }, [branchName, isLoading, visibleNodes.length, streamPreview]);

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
      await Promise.all([refreshHistory(), mutateArtefact()]);
    } catch (err) {
      setBranchActionError((err as Error).message);
    } finally {
      setIsSwitching(false);
    }
  };

  const createBranch = async () => {
    if (!newBranchName.trim()) return false;
    setIsCreating(true);
    setBranchActionError(null);
    try {
      const branchModel =
        providerOptions.find((option) => option.id === newBranchProvider)?.defaultModel ??
        getDefaultModelForProviderFromCapabilities(newBranchProvider);
      const res = await fetch(`/api/projects/${project.id}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBranchName.trim(),
          fromRef: branchName,
          provider: newBranchProvider,
          model: branchModel
        })
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
        window.localStorage.setItem(`researchtree:thinking:${project.id}:${data.branchName}`, newBranchThinking);
      }
      await Promise.all([refreshHistory(), mutateArtefact()]);
      return true;
    } catch (err) {
      setBranchActionError((err as Error).message);
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  const closeMergeModal = () => {
    if (isMerging) return;
    setShowMergeModal(false);
    setMergeSummary('');
    setMergeError(null);
  };

  return (
    <>
      <RailPageLayout
        renderRail={(ctx) => (
          <div className="mt-6 flex h-full flex-col gap-6">
            {!ctx.railCollapsed ? (
              <>
                <div className="rounded-2xl border border-divider/70 bg-white/80 px-3 py-2 shadow-sm">
                  <div className="truncate text-xs font-semibold text-slate-800">{project.name}</div>
                  <div className="truncate text-[11px] text-muted">{project.description ?? 'No description provided.'}</div>
                </div>
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
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <span
                              className="inline-flex h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: getBranchColor(branch.name, trunkName, branchColorMap) }}
                            />
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
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {branchActionError ? <p className="text-sm text-red-600">{branchActionError}</p> : null}
                </div>

                {features.uiRailBranchCreator ? (
                  <NewBranchFormCard
                    fromLabel={displayBranchName(branchName)}
                    value={newBranchName}
                    onValueChange={setNewBranchName}
                    onSubmit={() => void createBranch()}
                    disabled={isSwitching}
                    submitting={isCreating}
                    error={branchActionError}
                    providerSelector={
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
                          <span className="font-semibold text-slate-700">Provider</span>
                          <select
                            value={newBranchProvider}
                            onChange={(event) => setNewBranchProvider(event.target.value as LLMProvider)}
                            className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                            disabled={isSwitching || isCreating}
                          >
                            {selectableProviderOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
                          <span className="font-semibold text-slate-700">Thinking</span>
                          <select
                            value={newBranchThinking}
                            onChange={(event) => setNewBranchThinking(event.target.value as ThinkingSetting)}
                            className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                            disabled={isSwitching || isCreating}
                          >
                            {(() => {
                              const branchModel =
                                providerOptions.find((option) => option.id === newBranchProvider)?.defaultModel ??
                                getDefaultModelForProviderFromCapabilities(newBranchProvider);
                              const allowed = branchModel
                                ? getAllowedThinkingSettings(newBranchProvider, branchModel)
                                : THINKING_SETTINGS;
                              return allowed.map((setting) => (
                                <option key={setting} value={setting}>
                                  {THINKING_SETTING_LABELS[setting]}
                                </option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                    }
                  />
                ) : null}

              </>
            ) : null}

            {ctx.railCollapsed ? (
              <div className="mt-auto flex flex-col items-start gap-3 pb-2">
                <div ref={hintsRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowHints((prev) => !prev)}
                    ref={hintsButtonRef}
                    className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                    aria-label={showHints ? 'Hide session tips' : 'Show session tips'}
                    aria-expanded={showHints}
                  >
                    <QuestionMarkCircleIcon className="h-4 w-4" />
                  </button>
                  <RailPopover
                    open={showHints}
                    anchorRef={hintsButtonRef}
                    ariaLabel="Session tips"
                    className="w-[320px] p-4 text-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">Session tips</p>
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                      <li>⌘ + Enter to send · Shift + Enter adds a newline.</li>
                      <li>⌘ + B to toggle the rail.</li>
                      <li>← Thred graph · → Canvas.</li>
                      <li>↑ show graph/canvas · ↓ hide panel.</li>
                      <li>Branch to try edits without losing the trunk.</li>
                      <li>Canvas edits are per-branch; merge intentionally carries a diff summary.</li>
                    </ul>
                  </RailPopover>
                </div>
                <AuthRailStatus railCollapsed={ctx.railCollapsed} onRequestExpandRail={ctx.toggleRail} />
                <Link
                  href="/"
                  className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
                  aria-label="Back to home"
                >
                  <HomeIcon className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="mt-auto space-y-3 pb-2">
                <div className="flex flex-col items-start gap-3">
                  <div ref={hintsRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShowHints((prev) => !prev)}
                      ref={hintsButtonRef}
                      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                      aria-label={showHints ? 'Hide session tips' : 'Show session tips'}
                      aria-expanded={showHints}
                    >
                      <QuestionMarkCircleIcon className="h-4 w-4" />
                    </button>
                    <RailPopover
                      open={showHints}
                      anchorRef={hintsButtonRef}
                      ariaLabel="Session tips"
                      className="w-[320px] p-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">Session tips</p>
                      </div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                      <li>⌘ + Enter to send · Shift + Enter adds a newline.</li>
                      <li>⌘ + B to toggle the rail.</li>
                      <li>← Thred graph · → Canvas.</li>
                      <li>↑ show graph/canvas · ↓ hide panel.</li>
                      <li>Branch to try edits without losing the trunk.</li>
                        <li>Canvas edits are per-branch; merge intentionally carries a diff summary.</li>
                      </ul>
                    </RailPopover>
                  </div>

                  <AuthRailStatus railCollapsed={ctx.railCollapsed} onRequestExpandRail={ctx.toggleRail} />

                  <Link
                    href="/"
                    className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                    aria-label="Back to home"
                  >
                    <HomeIcon className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
        renderMain={(ctx) => (
          <div className="relative flex h-full min-h-0 min-w-0 flex-col bg-white">
            <div
              className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-4 pt-3 md:px-8 lg:px-12"
              style={{ paddingBottom: composerPadding }}
            >
              <div ref={paneContainerRef} className="flex h-full min-h-0 min-w-0 flex-col gap-6 lg:flex-row lg:gap-0">
                <section
                  className={`card-surface relative flex h-full min-h-0 min-w-0 flex-col gap-4 p-5 ${
                    chatPaneWidth ? 'flex-1' : 'flex-1 lg:flex-[2]'
                  }`}
                  style={chatPaneWidth ? { flexBasis: chatPaneWidth } : undefined}
                >
                  <div className="pointer-events-none absolute left-5 right-5 top-5 z-10 flex flex-wrap items-center gap-3">
                    {branchName !== trunkName && sharedCount > 0 ? (
                      <div className="pointer-events-auto w-full md:w-3/5 md:ml-4">
                        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[rgba(238,243,255,0.95)] px-4 py-3 text-sm text-slate-700 shadow-sm">
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-primary/80" />
                            <span
                              className="min-w-0 flex-1 whitespace-normal"
                              style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                              Shared {sharedCount} {sharedCount === 1 ? 'message' : 'messages'} from upstream
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setHideShared((prev) => !prev)}
                            className="ml-auto rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
                          >
                            {hideShared ? 'Show' : 'Hide'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-2 md:mr-4">
                      <div className="flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-1 text-xs shadow-sm">
                        <span className="font-medium text-slate-700">Provider</span>
                        <span
                          className="rounded-lg border border-divider/60 bg-white px-2 py-2 text-xs text-slate-800"
                          title={branchModel}
                        >
                          {branchProviderLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                <div
                  ref={messageListRef}
                  data-testid="chat-message-list"
                  className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pr-1 pt-12 pb-6"
                  onScroll={handleMessageListScroll}
                >
                  {isLoading ? (
                    <p className="text-sm text-muted">Loading history…</p>
                  ) : error ? (
                    <p className="text-sm text-red-600">Failed to load history.</p>
                  ) : visibleNodes.length === 0 ? (
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
                                branchColors={branchColorMap}
                                muted
                                messageInsetClassName="pr-3"
                                subtitle={node.createdOnBranch ? `from ${node.createdOnBranch}` : undefined}
                                isStarred={starredSet.has(node.id)}
                                onToggleStar={() => void toggleStar(node.id)}
                                onEdit={
                                  node.type === 'message' && (node.role === 'user' || features.uiEditAnyMessage)
                                    ? (n) => openEditModal(n)
                                    : undefined
                                }
                                isCanvasDiffPinned={undefined}
                                onPinCanvasDiff={undefined}
                                highlighted={highlightedNodeId === node.id}
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
                          branchColors={branchColorMap}
                          messageInsetClassName="pr-3"
                          isStarred={starredSet.has(node.id)}
                          onToggleStar={() => void toggleStar(node.id)}
                          onEdit={
                            node.type === 'message' && (node.role === 'user' || features.uiEditAnyMessage)
                              ? (n) => openEditModal(n)
                              : undefined
                          }
                          isCanvasDiffPinned={node.type === 'merge' ? pinnedCanvasDiffMergeIds.has(node.id) : undefined}
                          onPinCanvasDiff={node.type === 'merge' ? pinCanvasDiffToCurrentBranch : undefined}
                          highlighted={highlightedNodeId === node.id}
                          showBranchSplit={showNewBranchPopover && branchSplitNodeId === node.id}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {hideShared && branchNodes.length === 0 && sharedCount > 0 ? (
                  <p className="text-sm italic text-muted">No new messages on this branch yet.</p>
                ) : null}

                {sortedBranches.length > 0 || state.error || thinkingUnsupportedError ? (
                  <div className="absolute bottom-4 left-4 right-10 flex items-center gap-3">
                    {state.error || thinkingUnsupportedError ? (
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-red-200 bg-red-50 px-4 text-sm text-red-700">
                        <span className="min-w-0 flex-1 truncate">{state.error ?? thinkingUnsupportedError}</span>
                        {state.error ? (
                          <button
                            type="button"
                            onClick={() => void sendDraft()}
                            className="shrink-0 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Retry
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}

                    {sortedBranches.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <div ref={newBranchPopoverRef} className="relative h-11">
                          {showNewBranchPopover ? (
                            <div className="absolute bottom-0 right-0 z-30 w-[420px] overflow-hidden rounded-2xl border border-divider/80 bg-white shadow-lg">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowNewBranchPopover(false);
                                  setBranchSplitNodeId(null);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-primary/10"
                                aria-label="Hide branch creator"
                              >
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                                  <BlueprintIcon icon="git-new-branch" className="h-4 w-4" />
                                </span>
                                New branch
                              </button>
                              <div className="border-t border-divider/80 bg-white/80 p-4">
                                <NewBranchFormCard
                                  fromLabel={displayBranchName(branchName)}
                                  value={newBranchName}
                                  onValueChange={setNewBranchName}
                                  onSubmit={async () => {
                                    const ok = await createBranch();
                                    if (ok) {
                                      setShowNewBranchPopover(false);
                                      setBranchSplitNodeId(null);
                                    }
                                  }}
                                  disabled={isSwitching}
                                  submitting={isCreating}
                                  error={branchActionError}
                                  providerSelector={
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
                                        <span className="font-semibold text-slate-700">Provider</span>
                                        <select
                                          value={newBranchProvider}
                                          onChange={(event) => setNewBranchProvider(event.target.value as LLMProvider)}
                                          className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                                          disabled={isSwitching || isCreating}
                                        >
                                          {selectableProviderOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
                                        <span className="font-semibold text-slate-700">Thinking</span>
                                        <select
                                          value={newBranchThinking}
                                          onChange={(event) => setNewBranchThinking(event.target.value as ThinkingSetting)}
                                          className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                                          disabled={isSwitching || isCreating}
                                        >
                                          {(() => {
                                            const branchModel =
                                              providerOptions.find((option) => option.id === newBranchProvider)?.defaultModel ??
                                              getDefaultModelForProviderFromCapabilities(newBranchProvider);
                                            const allowed = branchModel
                                              ? getAllowedThinkingSettings(newBranchProvider, branchModel)
                                              : THINKING_SETTINGS;
                                            return allowed.map((setting) => (
                                              <option key={setting} value={setting}>
                                                {THINKING_SETTING_LABELS[setting]}
                                              </option>
                                            ));
                                          })()}
                                        </select>
                                      </div>
                                    </div>
                                  }
                                  autoFocus
                                  variant="plain"
                                />
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowNewBranchPopover(true)}
                              disabled={isCreating || isSwitching}
                              className="inline-flex h-full items-center gap-2 rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10 disabled:opacity-60"
                              aria-label="Show branch creator"
                            >
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                                <BlueprintIcon icon="git-new-branch" className="h-4 w-4" />
                              </span>
                              New branch
                            </button>
                          )}
                        </div>

                        {sortedBranches.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMergeError(null);
                              setMergeSummary('');
                              setMergeTargetBranch(trunkName);
                              setShowMergeModal(true);
                            }}
                            disabled={isMerging}
                            className="inline-flex h-11 items-center gap-2 rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10 disabled:opacity-60"
                          >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <BlueprintIcon icon="git-merge" className="h-4 w-4" />
                            </span>
                            Merge…
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                </section>

            <div
              className="hidden lg:flex h-full flex-none items-stretch"
              style={{ width: SPLIT_GAP, minWidth: SPLIT_GAP, maxWidth: SPLIT_GAP }}
            >
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
                <div className="relative h-full w-1">
                  <div className="absolute left-1/2 top-0 h-[calc(50%-8px)] w-[1.5px] -translate-x-1/2 bg-divider/70 transition group-hover:bg-primary/40" />
                  <div className="absolute left-1/2 bottom-0 h-[calc(50%-8px)] w-[1.5px] -translate-x-1/2 bg-divider/70 transition group-hover:bg-primary/40" />
                  <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-divider/80 transition group-hover:ring-primary/50" />
                </div>
              </div>
            </div>

            <div
              ref={insightPaneRef}
              className={`flex h-full min-h-0 min-w-0 flex-col gap-4 ${
                insightCollapsed ? 'lg:w-14 lg:flex-none' : insightPaneWidth ? 'lg:flex-none' : 'lg:min-w-[360px] lg:flex-1'
              }`}
              style={!insightCollapsed && insightPaneWidth ? { flex: `0 0 ${insightPaneWidth}px` } : undefined}
            >
              {insightCollapsed ? (
                <button
                  type="button"
                  onClick={() => {
                    expandInsights();
                  }}
                  aria-label="Show canvas / graph panel"
                  className="card-surface flex h-full w-full items-start justify-center rounded-2xl border border-dashed border-divider/70 bg-white/80 px-2 py-6 text-sm font-semibold text-primary shadow-sm hover:bg-primary/5"
                >
                  <span className="whitespace-nowrap text-xs font-semibold tracking-wide text-slate-700 [writing-mode:vertical-rl] [text-orientation:mixed]">
                    Graph | Canvas
                  </span>
                </button>
              ) : (
                <section className="card-surface flex h-full min-h-0 flex-col gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-1 items-center gap-1 rounded-full bg-slate-100/80 p-1 text-xs font-semibold text-slate-700">
                      <button
                        type="button"
                        onClick={() => setInsightTab('graph')}
                        className={`flex-1 rounded-full px-3 py-1 transition ${
                          insightTab === 'graph' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Thred graph
                      </button>
                      <button
                        type="button"
                        onClick={() => setInsightTab('canvas')}
                        className={`flex-1 rounded-full px-3 py-1 transition ${
                          insightTab === 'canvas' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Canvas
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        collapseInsights();
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
                                  [branchName]: visibleNodes
                                }
                              }
                              activeBranchName={branchName}
                              trunkName={trunkName}
                              branchColors={branchColorMap}
                              mode={graphMode}
                              onModeChange={setGraphMode}
                              starredNodeIds={stableStarredNodeIds}
                              selectedNodeId={selectedGraphNodeId}
                              onSelectNode={(nodeId) => setSelectedGraphNodeId(nodeId)}
                            />
                            {selectedGraphNodeId ? (
                              <div className="border-t border-divider/80 bg-white/90 p-3 text-sm backdrop-blur">
                                {(() => {
                                  const activeMatch = visibleNodes.find((node) => node.id === selectedGraphNodeId) ?? null;
                                  let record: NodeRecord | null = activeMatch;
                                  let targetBranch: string = branchName;

                                  if (!record && graphHistories) {
                                    for (const [b, hist] of Object.entries(graphHistories)) {
                                      const found = hist.find((node) => node.id === selectedGraphNodeId);
                                      if (found) {
                                        record = found;
                                        targetBranch = b;
                                        break;
                                      }
                                    }
                                  }

                                  if (!record) {
                                    return (
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-muted">Selected node not found in current histories.</div>
                                        <button
                                          type="button"
                                          className="rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10"
                                          aria-label="Clear graph selection"
                                          onClick={() => setSelectedGraphNodeId(null)}
                                        >
                                          Clear
                                        </button>
                                      </div>
                                    );
                                  }

                                  const title =
                                    record.type === 'merge'
                                      ? `Notes brought in from ${displayBranchName(record.mergeFrom)}`
                                      : record.type === 'state'
                                      ? 'Canvas saved'
                                      : record.type === 'message' && record.role === 'assistant'
                                      ? 'Assistant replied'
                                      : record.type === 'message' && record.role === 'user'
                                      ? 'You said'
                                      : record.type === 'message' && record.role === 'system'
                                      ? 'System note'
                                      : 'Selected node';

                                  const mergeRecord = record.type === 'merge' ? record : null;
                                  const canvasDiff = mergeRecord?.canvasDiff?.trim() ?? '';
                                  const hasCanvasDiff = !!mergeRecord && canvasDiff.length > 0;
                                  const nodesOnTargetBranch =
                                    targetBranch === branchName ? visibleNodes : graphHistories?.[targetBranch] ?? [];
                                  const isCanvasDiffPinned =
                                    !!mergeRecord &&
                                    nodesOnTargetBranch.some(
                                      (node) =>
                                        node.type === 'message' && node.role === 'assistant' && node.pinnedFromMergeId === mergeRecord.id
                                    );

                                  const copyText =
                                    record.type === 'message'
                                      ? record.content
                                      : mergeRecord
                                      ? [
                                          `Summary:\n${mergeRecord.mergeSummary ?? ''}`.trim(),
                                          mergeRecord.mergedAssistantContent?.trim()
                                            ? `Assistant notes:\n${mergeRecord.mergedAssistantContent}`.trim()
                                            : '',
                                          hasCanvasDiff ? `Canvas changes:\n${canvasDiff}`.trim() : ''
                                        ]
                                          .filter((part) => part.trim().length > 0)
                                          .join('\n\n')
                                      : record.type === 'state'
                                      ? 'Canvas saved'
                                      : '';

                                  return (
                                    <div className="flex flex-col gap-2">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <div className="text-sm font-semibold text-slate-900">{title}</div>
                                          <div className="text-xs text-muted">
                                            {new Date(record.timestamp).toLocaleString()}
                                            {targetBranch !== branchName ? ` · on ${displayBranchName(targetBranch)}` : ''}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={!copyText}
                                            className="rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                                            aria-label="Copy selection"
                                            onClick={() => {
                                              void (async () => {
                                                await copyTextToClipboard(copyText);
                                                setGraphCopyFeedback(true);
                                                if (graphCopyFeedbackTimeoutRef.current) {
                                                  clearTimeout(graphCopyFeedbackTimeoutRef.current);
                                                }
                                                graphCopyFeedbackTimeoutRef.current = setTimeout(() => {
                                                  setGraphCopyFeedback(false);
                                                }, 1200);
                                              })();
                                            }}
                                          >
                                            {graphCopyFeedback ? 'Copied' : 'Copy'}
                                          </button>
                                          <button
                                            type="button"
                                            className="rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10"
                                            aria-label="Clear graph selection"
                                            onClick={() => setSelectedGraphNodeId(null)}
                                          >
                                            Clear
                                          </button>
                                        </div>
                                      </div>

                                      {record.type === 'message' ? (
                                        <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
                                          {record.content}
                                        </div>
                                      ) : null}

                                      {mergeRecord ? (
                                        <div className="space-y-2">
                                          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
                                            <div className="font-semibold text-slate-800">Summary</div>
                                            <div className="mt-1 whitespace-pre-wrap">{mergeRecord.mergeSummary}</div>
                                          </div>
                                          {mergeRecord.mergedAssistantContent?.trim() ? (
                                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
                                              <div className="font-semibold text-slate-800">Assistant notes</div>
                                              <div className="mt-1 whitespace-pre-wrap">{mergeRecord.mergedAssistantContent}</div>
                                            </div>
                                          ) : null}
                                          {hasCanvasDiff ? (
                                            <details className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
                                              <summary className="cursor-pointer select-none font-semibold text-slate-800">
                                                Canvas changes
                                              </summary>
                                              <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-700">
                                                {canvasDiff}
                                              </pre>
                                            </details>
                                          ) : (
                                            <div className="text-xs text-muted">No canvas changes recorded on this node.</div>
                                          )}
                                        </div>
                                      ) : null}

                                      {graphDetailError ? <p className="text-xs text-red-600">{graphDetailError}</p> : null}

                                      <div className="flex justify-end gap-2">
                                        {mergeRecord && hasCanvasDiff ? (
                                          isCanvasDiffPinned ? (
                                            <span className="self-center text-xs font-semibold text-emerald-700" aria-label="Canvas changes already added">
                                              Canvas changes added
                                            </span>
                                          ) : confirmGraphAddCanvas ? (
                                            <>
                                              <button
                                                type="button"
                                                disabled={isGraphDetailBusy}
                                                className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
                                                aria-label="Confirm add canvas changes to chat"
                                                onClick={() => {
                                                  void (async () => {
                                                    setGraphDetailError(null);
                                                    setIsGraphDetailBusy(true);
                                                    try {
                                                      if (targetBranch === branchName) {
                                                        await pinCanvasDiffToCurrentBranch(mergeRecord.id);
                                                      } else {
                                                        const result = await pinCanvasDiffToContext(mergeRecord.id, targetBranch);
                                                        const pinnedNode = result?.pinnedNode;
                                                        if (pinnedNode && graphHistories?.[targetBranch]) {
                                                          setGraphHistories((prev) => {
                                                            if (!prev) return prev;
                                                            const existing = prev[targetBranch] ?? [];
                                                            if (existing.some((n) => n.id === pinnedNode.id)) return prev;
                                                            return { ...prev, [targetBranch]: [...existing, pinnedNode] };
                                                          });
                                                        }
                                                      }
                                                      setConfirmGraphAddCanvas(false);
                                                    } catch (err) {
                                                      setGraphDetailError((err as Error)?.message ?? 'Failed to add canvas changes');
                                                    } finally {
                                                      setIsGraphDetailBusy(false);
                                                    }
                                                  })();
                                                }}
                                              >
                                                {isGraphDetailBusy ? 'Adding…' : 'Confirm'}
                                              </button>
                                              <button
                                                type="button"
                                                disabled={isGraphDetailBusy}
                                                className="rounded-full border border-divider/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                                                aria-label="Cancel add canvas changes to chat"
                                                onClick={() => {
                                                  setConfirmGraphAddCanvas(false);
                                                  setGraphDetailError(null);
                                                }}
                                              >
                                                Cancel
                                              </button>
                                            </>
                                          ) : (
                                            <button
                                              type="button"
                                              disabled={isGraphDetailBusy}
                                              className="rounded-full border border-divider/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                                              aria-label="Add canvas changes to chat"
                                              onClick={() => setConfirmGraphAddCanvas(true)}
                                            >
                                              Add canvas changes
                                            </button>
                                          )
                                        ) : null}
                                        <button
                                          type="button"
                                          className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90"
                                          aria-label="Jump to message"
                                          onClick={async () => {
                                            setPendingScrollTo({ nodeId: selectedGraphNodeId, targetBranch });
                                            if (targetBranch !== branchName) {
                                              await switchBranch(targetBranch);
                                            }
                                          }}
                                        >
                                          Jump to message
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : null}
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
                                  onFocus={() => setIsCanvasFocused(true)}
                                  onBlur={() => setIsCanvasFocused(false)}
                                  className="h-full w-full resize-none bg-transparent px-4 py-4 pb-12 text-sm leading-relaxed text-slate-800 focus:outline-none"
                                />
                                {!isCanvasFocused && artefactDraft.length === 0 ? (
                                  <div className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400">
                                    Add notes to the canvas…
                                  </div>
                                ) : null}
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
              style={{ paddingLeft: ctx.railCollapsed ? '72px' : '320px' }}
            >
              <div
                ref={composerRef}
                className="flex items-center gap-2 rounded-full border border-divider bg-white px-3 py-2 shadow-composer"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!webSearchAvailable || state.isStreaming) return;
                      setWebSearchEnabled((prev) => !prev);
                    }}
                    className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 py-0 text-xs font-semibold leading-none transition focus:outline-none ${
                      webSearchEnabled
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-divider/80 bg-white text-slate-700 hover:bg-primary/10'
                    } ${!webSearchAvailable ? 'opacity-50' : ''}`}
                    aria-label="Toggle web search"
                    aria-pressed={webSearchEnabled}
                    disabled={state.isStreaming || !webSearchAvailable}
                  >
                    <SearchIcon className="h-4 w-4" />
                    <span>Web search</span>
                  </button>
                  {/* <div className="flex h-10 w-10 items-center justify-center">
                    {features.uiAttachments ? (
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-slate-700 transition hover:bg-primary/10 focus:outline-none"
                        aria-label="Add attachment"
                      >
                        <PaperClipIcon className="h-5 w-5" />
                      </button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </div> */}
                </div>
                <div className="relative flex-1">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask anything"
                    rows={2}
                    className="flex-1 w-full resize-none rounded-lg border border-slate-200/80 bg-white/70 px-3 pb-6 pt-1.5 text-base leading-relaxed placeholder:text-muted focus:ring-2 focus:ring-primary/30 focus:outline-none"
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
                  <div className="pointer-events-none absolute inset-x-3 bottom-1 flex items-center text-[11px] text-slate-400">
                    <span className="flex-1 text-left">
                      {showOpenAISearchNote ? 'Search uses gpt-4o-mini-search-preview.' : ''}
                    </span>
                    <span className="flex-[2] whitespace-nowrap text-center">
                      ⌘ + Enter to send · Shift + Enter adds a newline.
                    </span>
                    <span className={`flex-1 text-right ${state.isStreaming ? 'animate-pulse text-primary' : ''}`}>
                      {state.isStreaming ? 'Streaming…' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div ref={thinkingMenuRef} className="relative hidden sm:block">
                    <button
                      type="button"
                      onClick={() => setThinkingMenuOpen((prev) => !prev)}
                      className="inline-flex h-9 items-center gap-1 rounded-full bg-slate-100 px-3 py-0 text-xs font-semibold leading-none text-slate-700 transition hover:bg-slate-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                        className="absolute bottom-full right-0 z-50 mb-2 w-44 rounded-xl border border-divider bg-white p-1 shadow-lg"
                      >
	                        {allowedThinking.map((setting) => {
	                          const active = thinking === setting;
	                          return (
	                            <button
	                              key={setting}
	                              type="button"
	                              role="menuitemradio"
	                              aria-checked={active}
	                              disabled={state.isStreaming}
	                              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
	                                active ? 'bg-primary/10 text-primary' : 'text-slate-700 hover:bg-primary/10'
	                              }`}
	                              onClick={() => {
	                                if (state.isStreaming) return;
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
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 shadow-sm transition hover:bg-red-100 focus:outline-none"
                      aria-label="Stop streaming"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  ) : null}
	                  <button
	                    type="submit"
	                    disabled={state.isStreaming || !draft.trim() || Boolean(thinkingUnsupportedError)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
	                    aria-label="Send message"
	                  >
                    <ArrowUpIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
        )}
      />

      {showMergeModal ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeMergeModal();
          }}
          onTouchStart={(event) => {
            if (event.target === event.currentTarget) closeMergeModal();
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Merge {displayBranchName(branchName)} into {displayBranchName(mergeTargetBranch)}
            </h3>
            <p className="text-sm text-muted">
              Summarize what to bring back and preview the Canvas diff. Canvas changes are never auto-applied.
            </p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="merge-target-branch">
                Target branch
              </label>
              <select
                id="merge-target-branch"
                value={mergeTargetBranch}
                onChange={(event) => setMergeTargetBranch(event.target.value)}
                className="w-full rounded-lg border border-divider/80 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isMerging}
              >
                {sortedBranches
                  .filter((branch) => branch.name !== branchName)
                  .map((branch) => (
                    <option key={branch.name} value={branch.name}>
                      {displayBranchName(branch.name)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="merge-summary">
                Merge summary
              </label>
              <textarea
                id="merge-summary"
                value={mergeSummary}
                onChange={(event) => setMergeSummary(event.target.value)}
                rows={4}
                placeholder={`What should come back to ${displayBranchName(mergeTargetBranch)}?`}
                className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm leading-relaxed shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isMerging}
              />
              <p className="text-xs text-muted">
                This summary is remembered on the target branch and injected into future LLM context as a merge note.
              </p>
            </div>

            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">Merge payload (assistant)</span>
                {mergePayloadCandidates.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowMergePayloadPicker((prev) => !prev)}
                    className="rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                    disabled={isMerging}
                    aria-label={showMergePayloadPicker ? 'Hide payload picker' : 'Show payload picker'}
                  >
                    {showMergePayloadPicker ? 'Hide advanced' : 'Advanced'}
                  </button>
                ) : null}
              </div>

              {selectedMergePayload ? (
                <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-divider/80 bg-slate-50 p-3 text-sm text-slate-800">
                  <p className="whitespace-pre-line leading-relaxed">{selectedMergePayload.content}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-rose-700">
                  This branch has no assistant messages to merge yet. Generate a response on this branch first.
                </p>
              )}

              {showMergePayloadPicker && mergePayloadCandidates.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <label className="text-sm font-medium text-slate-800" htmlFor="merge-payload-select">
                    Choose payload message
                  </label>
                  <select
                    id="merge-payload-select"
                    value={mergePayloadNodeId ?? ''}
                    onChange={(event) => setMergePayloadNodeId(event.target.value || null)}
                    className="w-full rounded-lg border border-divider/80 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                    disabled={isMerging}
                  >
                    {mergePayloadCandidates.map((node) => {
                      const firstLine = getNodeText(node).split(/\r?\n/)[0] ?? '';
                      const label = `${new Date(node.timestamp).toLocaleTimeString()} · ${firstLine}`.slice(0, 120);
                      return (
                        <option key={node.id} value={node.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : null}
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
                      No Canvas differences between {displayBranchName(branchName)} and {displayBranchName(mergeTargetBranch)}.
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
                onClick={closeMergeModal}
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
                  if (!selectedMergePayload) {
                    setMergeError('This branch has no assistant payload to merge yet.');
                    return;
                  }
                  if (mergeTargetBranch === branchName) {
                    setMergeError('Target branch must be different from the source branch.');
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
                        targetBranch: mergeTargetBranch,
                        mergeSummary: mergeSummary.trim(),
                        sourceAssistantNodeId: selectedMergePayload.id
                      })
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      throw new Error(data?.error?.message ?? 'Merge failed');
                    }
                    const data = (await res.json().catch(() => null)) as { mergeNode?: { id: string } } | null;
                    const mergeNodeId = data?.mergeNode?.id ?? null;
                    if (mergeNodeId) {
                      setPendingScrollTo({ nodeId: mergeNodeId, targetBranch: mergeTargetBranch });
                    }

                    // Switch to the target so the user immediately sees the merge node created there.
                    await switchBranch(mergeTargetBranch);

                    closeMergeModal();
                  } catch (err) {
                    setMergeError((err as Error).message);
                  } finally {
                    setIsMerging(false);
                  }
                }}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isMerging || isMergePreviewLoading || !selectedMergePayload}
              >
                {isMerging ? 'Merging…' : `Merge into ${displayBranchName(mergeTargetBranch)}`}
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
	            <div className="mt-4 flex flex-wrap items-center gap-2">
	              <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
	                <span className="font-semibold text-slate-700">Provider</span>
	                <select
	                  value={editProvider}
	                  onChange={(event) => setEditProvider(event.target.value as LLMProvider)}
	                  className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
	                  disabled={isEditing}
	                >
	                  {selectableProviderOptions.map((option) => (
	                    <option key={option.id} value={option.id}>
	                      {option.label}
	                    </option>
	                  ))}
	                </select>
	              </div>
	              <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
	                <span className="font-semibold text-slate-700">Thinking</span>
	                <select
	                  value={editThinking}
	                  onChange={(event) => setEditThinking(event.target.value as ThinkingSetting)}
	                  className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
	                  disabled={isEditing}
	                >
		                  {(() => {
		                    const editModel =
		                      providerOptions.find((option) => option.id === editProvider)?.defaultModel ??
		                      getDefaultModelForProviderFromCapabilities(editProvider);
		                    const allowed = editModel ? getAllowedThinkingSettings(editProvider, editModel) : THINKING_SETTINGS;
		                    return allowed.map((setting) => (
		                      <option key={setting} value={setting}>
		                        {THINKING_SETTING_LABELS[setting]}
	                      </option>
	                    ));
	                  })()}
	                </select>
	              </div>
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
                    const editModel =
                      providerOptions.find((option) => option.id === editProvider)?.defaultModel ??
                      getDefaultModelForProviderFromCapabilities(editProvider);
                    const fromRef = editingNode?.createdOnBranch ?? branchName;
                    const res = await fetch(`/api/projects/${project.id}/edit`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        content: editDraft.trim(),
                        branchName: editBranchName.trim(),
                        fromRef,
                        llmProvider: editProvider,
                        llmModel: editModel,
                        thinking: editThinking,
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
                      window.localStorage.setItem(`researchtree:thinking:${project.id}:${data.branchName}`, editThinking);
                    }
                    await Promise.all([refreshHistory(), mutateArtefact()]);
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
    </>
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
