// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { ProjectMetadata, NodeRecord, BranchSummary, MessageNode } from '@git/types';
import type { LLMProvider } from '@/src/server/llm';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useChatStream } from '@/src/hooks/useChatStream';
import { useLeaseSession } from '@/src/hooks/useLeaseSession';
import { consumeNdjsonStream } from '@/src/utils/ndjsonStream';
import { THINKING_SETTINGS, THINKING_SETTING_LABELS, type ThinkingSetting } from '@/src/shared/thinking';
import { getAllowedThinkingSettings, getDefaultModelForProviderFromCapabilities, getDefaultThinkingSetting } from '@/src/shared/llmCapabilities';
import { features } from '@/src/config/features';
import { storageKey, TRUNK_LABEL, USER_MESSAGE_MAX_LINES } from '@/src/config/app';
import { CHAT_LIMITS } from '@/src/shared/chatLimits';
import {
  deriveTextFromBlocks,
  deriveThinkingFromBlocks,
  getContentBlocksWithLegacyFallback,
  type ThinkingContentBlock
} from '@/src/shared/thinkingTraces';
import ReactMarkdown from 'react-markdown';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import remarkGfm from 'remark-gfm';
import useSWR from 'swr';
import type { FC } from 'react';
import { RailPageLayout } from '@/src/components/layout/RailPageLayout';
import type { RailLayoutContext } from '@/src/components/layout/RailLayout';
import { BlueprintIcon } from '@/src/components/ui/BlueprintIcon';
import { CreateProjectForm } from '@/src/components/projects/CreateProjectForm';
import { WorkspaceGraph } from './WorkspaceGraph';
import { buildBranchColorMap, getBranchColor } from './branchColors';
import { InsightFrame } from './InsightFrame';
import { AuthRailStatus } from '@/src/components/auth/AuthRailStatus';
import { RailPopover } from '@/src/components/layout/RailPopover';
import { NewBranchFormCard } from '@/src/components/workspace/NewBranchFormCard';
import { CommandEnterForm } from '@/src/components/forms/CommandEnterForm';
import { WorkspaceComposer, type WorkspaceComposerHandle } from './WorkspaceComposer';
import {
  CheckIcon,
  HomeIcon,
  ConsoleIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  SharedWorkspaceIcon,
  Square2StackIcon
} from './HeroIcons';
import { MarkdownWithCopy } from './MarkdownWithCopy';
import { copyTextToClipboard } from './clipboard';
import type { GraphViews } from '@/src/shared/graph';
import { buildGraphPayload } from '@/src/shared/graph/buildGraph';
import { deriveForkParentNodeId } from '@/src/shared/graph/deriveForkParentNodeId';

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

const findFirstCreatedOnBranchNode = (nodes: NodeRecord[], branchName: string): NodeRecord | null => {
  for (const node of nodes) {
    if (node.createdOnBranch === branchName) {
      return node;
    }
  }
  return null;
};

const isQuestionBranchHistory = (nodes: NodeRecord[], branchName: string): boolean => {
  const firstCreated = findFirstCreatedOnBranchNode(nodes, branchName);
  if (!firstCreated || firstCreated.type !== 'message') return false;
  const text = getNodeText(firstCreated);
  return QUESTION_BRANCH_MARKER_REGEX.test(text);
};

const normalizeMessageText = (value: string) => value.replace(/\r\n/g, '\n').trim();
const buildQuestionBranchName = (highlightText: string) => {
  const normalized = highlightText
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 50);
  return normalized ? `q/${normalized}` : '';
};

const formatCharLimitMessage = (label: string, current: number, max: number) => {
  return `${label} is too long (${current} chars). Max ${max} characters.`;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (value: string) => {
  return EMAIL_PATTERN.test(value);
};

const buildQuestionMessage = (question: string, highlight?: string) => {
  const trimmedQuestion = question.trim();
  const trimmedHighlight = highlight?.trim() ?? '';
  if (!trimmedHighlight) {
    return trimmedQuestion;
  }
  return ['Highlighted passage:', `"""${trimmedHighlight}"""`, '', 'Question:', trimmedQuestion].join('\n');
};

const QUESTION_BRANCH_MARKER_REGEX = /highlighted passage:/i;
const HTML_TAG_DETECTION_REGEX = /<([a-z][\s\S]*?)>/i;

const normalizeMarkdownOutput = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const convertHtmlToMarkdown = (html: string): string => {
  const output = NodeHtmlMarkdown.translate(html);
  return normalizeMarkdownOutput(output);
};

const createClientId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
};

const MiniChatMessage: FC<{ node: MessageNode }> = ({ node }) => {
  const messageText = getNodeText(node);
  if (!messageText) return null;
  const isUser = node.role === 'user';
  const align = isUser ? 'items-end' : 'items-start';
  const bubble = isUser
    ? 'bg-slate-100 text-slate-900'
    : 'border border-divider/70 bg-white text-slate-900';

  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-full rounded-xl px-3 py-2 text-sm ${bubble}`}>
        {isUser ? (
          <p className="whitespace-pre-line break-words text-sm leading-relaxed">{messageText}</p>
        ) : (
          <div className="prose prose-sm prose-slate max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{messageText}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

const QuestionBranchModal: FC<{
  projectId: string;
  branchName: string;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}> = ({ projectId, branchName, index, total, onClose, onPrevious, onNext }) => {
  const { nodes, isLoading, error } = useProjectData(projectId, { ref: branchName });
  const messageNodes = useMemo(
    () => nodes.filter((node): node is MessageNode => node.type === 'message'),
    [nodes]
  );
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const positionKey = 'question-branch-preview-position';
  const questionNodeIndex = useMemo(() => {
    for (let i = messageNodes.length - 1; i >= 0; i -= 1) {
      if (messageNodes[i]?.role === 'user') {
        return i;
      }
    }
    return -1;
  }, [messageNodes]);
  const questionNode = questionNodeIndex >= 0 ? messageNodes[questionNodeIndex] : null;
  const questionText = questionNode ? getNodeText(questionNode) : '';
  const answerNode =
    questionNodeIndex >= 0
      ? messageNodes.slice(questionNodeIndex + 1).find((node) => node.role === 'assistant') ?? null
      : null;
  const displayNodes = answerNode ? [answerNode] : [];
  const canNavigate = total > 1;
  const clampDragOffset = useCallback((nextX: number, nextY: number) => {
    if (typeof window === 'undefined') return { x: nextX, y: nextY };
    const modal = modalRef.current;
    if (!modal) return { x: nextX, y: nextY };
    const maxX = Math.max(0, (window.innerWidth - modal.offsetWidth) / 2 - 16);
    const maxY = Math.max(0, (window.innerHeight - modal.offsetHeight) / 2 - 16);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextX)),
      y: Math.min(maxY, Math.max(-maxY, nextY))
    };
  }, []);
  const persistOffset = useCallback((value: { x: number; y: number }) => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(positionKey, JSON.stringify(value));
    } catch {
      // Ignore storage failures.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.sessionStorage.getItem(positionKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { x?: number; y?: number } | null;
      if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return;
      setDragOffset(clampDragOffset(parsed.x, parsed.y));
    } catch {
      // Ignore storage failures.
    }
  }, [clampDragOffset]);

  const handleDragStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button')) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: dragOffset.x,
        originY: dragOffset.y
      };
    },
    [dragOffset]
  );

  const handleDragMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current) return;
      const { startX, startY, originX, originY } = dragStateRef.current;
      const nextX = originX + event.clientX - startX;
      const nextY = originY + event.clientY - startY;
      setDragOffset(clampDragOffset(nextX, nextY));
    },
    [clampDragOffset]
  );

  const handleDragEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      persistOffset(dragOffset);
    },
    [dragOffset, persistOffset]
  );

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onTouchStart={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-xl rounded-2xl border border-divider/70 bg-white shadow-2xl"
        style={dragOffset.x || dragOffset.y ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : undefined}
        data-question-branches-modal="true"
        role="dialog"
        aria-label="Question branch preview"
      >
        <div
          className="flex cursor-move items-center justify-between gap-2 border-b border-divider/60 px-4 py-3 touch-none"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question branch</p>
            <p className="truncate text-sm font-semibold text-slate-900">{branchName}</p>
          </div>
          <div className="flex items-center gap-1">
            {canNavigate ? (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={onPrevious}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-divider/70 text-slate-600 transition hover:bg-slate-50"
                  aria-label="Previous question branch"
                >
                  <BlueprintIcon icon="chevron-left" className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[40px] text-center">
                  {index + 1} / {total}
                </span>
                <button
                  type="button"
                  onClick={onNext}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-divider/70 text-slate-600 transition hover:bg-slate-50"
                  aria-label="Next question branch"
                >
                  <BlueprintIcon icon="chevron-right" className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-divider/70 text-slate-600 transition hover:bg-slate-50"
              aria-label="Close question branch preview"
            >
              <BlueprintIcon icon="cross" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          {questionText ? (
            <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question</p>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{questionText}</p>
            </div>
          ) : null}
          <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading branch history…</p>
            ) : error ? (
              <p className="text-sm text-red-600">Failed to load branch history.</p>
            ) : displayNodes.length === 0 ? (
              <p className="text-sm text-slate-500">No responses yet.</p>
            ) : (
              displayNodes.map((node) => <MiniChatMessage key={node.id} node={node} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

type DiffLine = {
  type: 'context' | 'added' | 'removed';
  value: string;
};

type AssistantLifecycle = 'idle' | 'pending' | 'streaming' | 'final' | 'error';

type StreamMeta = {
  branch: string;
  startedAt: number;
  clientRequestId: string;
  requiresUserMatch: boolean;
};

const MESSAGE_LIST_BASE_PADDING = 24;
const DEBUG_ASSISTANT_LIFECYCLE = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
const DEBUG_MESSAGE_SCROLL = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';

type BackgroundTask = {
  id: string;
  branchName: string;
  kind: 'edit' | 'question';
  switchOnComplete: boolean;
};

type ToastTone = 'info' | 'success' | 'error';

type ToastMessage = {
  id: string;
  tone: ToastTone;
  message: string;
};

type BranchListItem = BranchSummary & {
  isGhost?: boolean;
};

type StoreMode = 'pg' | 'git';

type QuestionBranchRef = {
  refId?: string | null;
  refName: string;
};

type ProjectMember = {
  userId: string;
  email: string | null;
  role: string;
  createdAt: string;
};

type ProjectInvite = {
  id: string;
  email: string;
  role: string;
  invitedBy: string | null;
  invitedByEmail: string | null;
  createdAt: string;
};

type RefLease = {
  refId: string;
  holderUserId: string;
  holderSessionId: string;
  expiresAt: string;
};

interface WorkspaceClientProps {
  project: ProjectMetadata;
  initialBranches: BranchSummary[];
  defaultProvider: LLMProvider;
  providerOptions: ProviderOption[];
  openAIUseResponses: boolean;
  storeMode: StoreMode;
}

interface ProviderOption {
  id: LLMProvider;
  label: string;
  defaultModel: string;
}

type RenderNode = NodeRecord & {
  renderId: string;
  clientState?: 'turn-user' | 'turn-assistant-pending' | 'turn-assistant';
};

const NodeBubble: FC<{
  node: RenderNode;
  muted?: boolean;
  subtitle?: string;
  isStarred?: boolean;
  isStarPending?: boolean;
  onToggleStar?: () => void;
  onEdit?: (node: MessageNode) => void;
  isCanvasDiffTagged?: boolean;
  onTagCanvasDiff?: (mergeNodeId: string) => Promise<void>;
  highlighted?: boolean;
  branchQuestionCandidate?: boolean;
  showOpenAiThinkingNote?: boolean;
  branchActionDisabled?: boolean;
  questionBranchCount?: number;
  isQuestionBranchesOpen?: boolean;
  onToggleQuestionBranches?: () => void;
  quoteSelectionText?: string;
  highlightMenuPoint?: { x: number; y: number } | null;
  highlightMenuOffset?: number;
  onQuoteReply?: (nodeId: string, messageText: string, selectionText?: string) => void;
}> = ({
  node,
  muted = false,
  subtitle,
  isStarred = false,
  isStarPending = false,
  onToggleStar,
  onEdit,
  isCanvasDiffTagged = false,
  onTagCanvasDiff,
  highlighted = false,
  branchQuestionCandidate = false,
  showOpenAiThinkingNote = false,
  branchActionDisabled = false,
  questionBranchCount = 0,
  isQuestionBranchesOpen = false,
  onToggleQuestionBranches,
  quoteSelectionText,
  highlightMenuPoint,
  highlightMenuOffset = 0,
  onQuoteReply
}) => {
  const renderId = node.renderId ?? node.id;
  const isUser = node.type === 'message' && node.role === 'user';
  const isMerge = node.type === 'merge';
  const isAssistantPending = node.clientState === 'turn-assistant-pending';
  const isTransientNode = node.clientState != null;
  const isAssistant = node.type === 'message' && node.role === 'assistant';
  const messageText = getNodeText(node);
  const thinkingText = getNodeThinkingText(node);
  const canCopy = node.type === 'message' && messageText.length > 0;
  const canQuoteReply = isAssistant && messageText.length > 0 && onQuoteReply;
  const hasQuestionBranches = questionBranchCount > 0 && onToggleQuestionBranches;
  const quoteSelectionActive = Boolean(quoteSelectionText?.trim());
  const showHighlightMenu =
    isAssistant &&
    quoteSelectionActive &&
    !!highlightMenuPoint &&
    (canQuoteReply || (onEdit && !isTransientNode));
  const [copyFeedback, setCopyFeedback] = useState(false);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isUserMessageExpanded, setIsUserMessageExpanded] = useState(false);
  const [canExpandUserMessage, setCanExpandUserMessage] = useState(false);
  const userMessageRef = useRef<HTMLParagraphElement | null>(null);
  const [showCanvasDiff, setShowCanvasDiff] = useState(false);
  const [confirmTagCanvasDiff, setConfirmTagCanvasDiff] = useState(false);
  const [tagCanvasDiffError, setTagCanvasDiffError] = useState<string | null>(null);
  const [isTaggingCanvasDiff, setIsTaggingCanvasDiff] = useState(false);
  const [showMergePayload, setShowMergePayload] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const hasThinking = isAssistant && thinkingText.trim().length > 0;
  const showThinkingBox = isAssistantPending || hasThinking || (isAssistant && showOpenAiThinkingNote);
  const thinkingInProgress = isAssistantPending || (node.clientState === 'turn-assistant' && messageText.length === 0);
  const showThinkingNote = isAssistant && showOpenAiThinkingNote && !hasThinking && !thinkingInProgress;
  const containerWidth = isMerge || isAssistant ? 'w-full' : '';
  const width = isMerge
    ? 'w-full max-w-[80%]'
    : isUser
      ? 'min-w-[14rem] max-w-[82%]'
      : isAssistant
        ? 'w-full'
        : 'max-w-[82%]';
  const base = `relative ${width} overflow-hidden rounded-2xl border px-4 py-3 transition`;
  const mergeChrome = isMerge ? 'border-emerald-200/80 pb-6 pr-10' : 'border-transparent';
  const palette = muted
    ? isUser
      ? 'bg-slate-100 text-slate-900'
      : 'bg-slate-50 text-slate-900'
    : isUser
    ? 'bg-slate-50 text-slate-900'
    : 'bg-white text-slate-900';
  const align = isMerge ? 'mx-auto items-center' : isUser ? 'ml-auto items-end' : 'mr-auto items-start';

  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setIsUserMessageExpanded(false);
    setCanExpandUserMessage(false);
  }, [renderId, messageText]);

  const measureUserMessageOverflow = useCallback(() => {
    if (!isUser || !messageText) return;
    const element = userMessageRef.current;
    if (!element) return;

    const prevDisplay = element.style.display;
    const prevOrient = element.style.webkitBoxOrient;
    const prevClamp = element.style.webkitLineClamp;
    const prevOverflow = element.style.overflow;

    element.style.display = '-webkit-box';
    element.style.webkitBoxOrient = 'vertical';
    element.style.webkitLineClamp = String(USER_MESSAGE_MAX_LINES);
    element.style.overflow = 'hidden';

    const isOverflowing = element.scrollHeight > element.clientHeight + 1;

    element.style.display = prevDisplay;
    element.style.webkitBoxOrient = prevOrient;
    element.style.webkitLineClamp = prevClamp;
    element.style.overflow = prevOverflow;

    setCanExpandUserMessage(isOverflowing);
    if (!isOverflowing && isUserMessageExpanded) {
      setIsUserMessageExpanded(false);
    }
  }, [isUser, messageText, isUserMessageExpanded]);

  useLayoutEffect(() => {
    measureUserMessageOverflow();
    if (!isUser || !messageText) return;
    const element = userMessageRef.current;
    if (!element) return;

    let rafId: number | null = null;
    const scheduleMeasurement = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        measureUserMessageOverflow();
      });
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasurement) : null;
    if (resizeObserver) {
      resizeObserver.observe(element);
    }
    window.addEventListener('resize', scheduleMeasurement);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasurement);
    };
  }, [isUser, messageText, isUserMessageExpanded, measureUserMessageOverflow]);

  return (
    <article className={`flex flex-col gap-1 ${align} ${containerWidth}`}>
      <div
        className={`${base} ${mergeChrome} ${palette} ${
          highlighted ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-white' : ''
        }`}
      >
        {isMerge ? (
          <span className="pointer-events-none absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
            <BlueprintIcon icon="git-merge" className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
        {showHighlightMenu ? (
          <div
            className="fixed z-50 flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-1 py-1 shadow-sm backdrop-blur"
            style={{
              left: highlightMenuPoint?.x ?? 0,
              top: (highlightMenuPoint?.y ?? 0) - highlightMenuOffset,
              transform: 'translate(-50%, -100%)'
            }}
          >
            {canQuoteReply ? (
              <button
                type="button"
                onClick={() => onQuoteReply?.(node.id, messageText, quoteSelectionText)}
                disabled={branchActionDisabled}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Quote reply from selection"
                title={branchActionDisabled ? 'Quote reply is disabled while streaming' : undefined}
              >
                <BlueprintIcon icon="comment" className="h-3.5 w-3.5" />
                Quote reply
              </button>
            ) : null}
            {onEdit && !isTransientNode ? (
              <button
                type="button"
                onClick={() => onEdit(node)}
                disabled={branchActionDisabled}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Ask a question on a new branch from selection"
                title={branchActionDisabled ? 'Branching is disabled while streaming' : undefined}
              >
                <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
                Ask a question
              </button>
            ) : null}
          </div>
        ) : null}
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
                <span>Thinking</span>
                {showThinkingNote ? (
                  <span className="text-[11px] font-medium text-slate-500">
                    OpenAI does not reveal thinking steps.
                  </span>
                ) : null}
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
              <div className="prose prose-sm prose-slate mt-2 max-w-none break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinkingText}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        ) : null}
        {node.type === 'message' && messageText ? (
          isAssistant ? (
            <div className="prose prose-sm prose-slate mt-2 max-w-none break-words" data-message-content>
              <MarkdownWithCopy content={messageText} />
            </div>
          ) : (
            <div className="mt-2 flex flex-col">
              <p
                ref={userMessageRef}
                className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-800"
                style={
                  isUserMessageExpanded
                    ? undefined
                    : {
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: USER_MESSAGE_MAX_LINES,
                        overflow: 'hidden'
                      }
                }
              >
                {messageText}
              </p>
              {canExpandUserMessage ? (
                <button
                  type="button"
                  onClick={() => setIsUserMessageExpanded((prev) => !prev)}
                  className="mt-2 self-end text-xs font-semibold text-primary transition hover:text-primary/80"
                  aria-label={isUserMessageExpanded ? 'Collapse message' : 'Expand message'}
                >
                  {isUserMessageExpanded ? 'See less' : 'See more'}
                </button>
              ) : null}
            </div>
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

              {onTagCanvasDiff ? (
                isCanvasDiffTagged ? (
                  <span className="font-semibold text-emerald-700" aria-label="Canvas diff tagged in chat">
                    Diff in context
                  </span>
                ) : confirmTagCanvasDiff ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isTaggingCanvasDiff}
                      onClick={() => {
                        void (async () => {
                          if (node.type !== 'merge') return;
                          setTagCanvasDiffError(null);
                          setIsTaggingCanvasDiff(true);
                          try {
                            await onTagCanvasDiff(node.id);
                            setConfirmTagCanvasDiff(false);
                          } catch (err) {
                            setTagCanvasDiffError((err as Error)?.message ?? 'Failed to tag diff in chat');
                          } finally {
                            setIsTaggingCanvasDiff(false);
                          }
                        })();
                      }}
                      className="rounded-full bg-primary px-3 py-1 font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                      aria-label="Confirm tag canvas diff in chat"
                    >
                      {isTaggingCanvasDiff ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                          <span>Adding…</span>
                        </span>
                      ) : (
                        'Confirm'
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isTaggingCanvasDiff}
                      onClick={() => {
                        setConfirmTagCanvasDiff(false);
                        setTagCanvasDiffError(null);
                      }}
                      className="rounded-full border border-divider/70 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      aria-label="Cancel tag canvas diff in chat"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmTagCanvasDiff(true)}
                    className="rounded-full border border-divider/70 bg-white px-3 py-1 font-semibold text-slate-700 transition hover:bg-primary/10"
                    aria-label="Tag canvas diff in chat"
                  >
                    Tag diff in chat
                  </button>
                )
              ) : null}
            </div>

            {showCanvasDiff ? (
              <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-800">
                {node.canvasDiff}
              </pre>
            ) : null}
            {tagCanvasDiffError ? <p className="mt-2 text-xs text-red-600">{tagCanvasDiffError}</p> : null}
          </div>
        ) : null}
        {subtitle ? <div className="mt-2 text-xs text-slate-500">{subtitle}</div> : null}

        <div className={`mt-3 flex flex-nowrap items-center gap-2 text-xs text-muted ${isUser ? 'justify-end' : 'justify-start'}`}>
          {isUser ? <span>{new Date(node.timestamp).toLocaleTimeString()}</span> : null}
          {onToggleStar ? (
            <button
              type="button"
              onClick={onToggleStar}
              disabled={isStarPending}
              className="rounded-full bg-slate-100 px-2 py-1 text-slate-600 hover:bg-primary/10 hover:text-primary focus:outline-none disabled:opacity-60"
              aria-label={isStarred ? 'Unstar node' : 'Star node'}
            >
              {isStarPending ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
              ) : (
                (isStarred ? '★' : '☆')
              )}
            </button>
          ) : null}
          {canCopy ? (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await copyTextToClipboard(messageText);
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
          {canQuoteReply ? (
            <button
              type="button"
              onClick={() => onQuoteReply(node.id, messageText, quoteSelectionText)}
              disabled={branchActionDisabled}
              className={`rounded-full px-2 py-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                quoteSelectionActive
                  ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary'
              }`}
              aria-label="Quote reply"
              title={branchActionDisabled ? 'Quote reply is disabled while streaming' : undefined}
            >
              <BlueprintIcon icon="comment" className="h-4 w-4" />
            </button>
          ) : null}
          {node.type === 'message' &&
          onEdit &&
          !isTransientNode &&
          (node.role === 'user' || node.role === 'assistant' || features.uiEditAnyMessage) ? (
            <button
              type="button"
              onClick={() => onEdit(node)}
              disabled={branchActionDisabled}
              className={`rounded-full px-2 py-1 focus:outline-none ${
                branchQuestionCandidate
                  ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              aria-label={
                branchQuestionCandidate
                  ? 'Ask a question on a new branch'
                  : node.role === 'assistant'
                    ? 'Create branch from message'
                    : 'Edit message'
              }
              title={branchActionDisabled ? 'Branching is disabled while streaming' : undefined}
            >
              {branchQuestionCandidate ? (
                <QuestionMarkCircleIcon className="h-4 w-4" />
              ) : (
                <BlueprintIcon icon="git-new-branch" className="h-4 w-4" />
              )}
            </button>
          ) : null}
          {hasQuestionBranches ? (
            <button
              type="button"
              onClick={onToggleQuestionBranches}
              data-question-branches-button="true"
              className={`rounded-full px-2 py-1 focus:outline-none transition ${
                isQuestionBranchesOpen
                  ? 'bg-primary/10 text-primary'
                  : 'bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary'
              }`}
              aria-label="View question branches"
            >
              <BlueprintIcon icon="endnote" className="h-4 w-4" />
            </button>
          ) : null}
          {!isUser ? <span>{new Date(node.timestamp).toLocaleTimeString()}</span> : null}
        </div>
      </div>
    </article>
  );
};

type ChatNodeRowProps = {
  node: RenderNode;
  trunkName: string;
  currentBranchName: string;
  defaultProvider: LLMProvider;
  providerByBranch: Record<string, LLMProvider>;
  branchColors?: Record<string, string>;
  muted?: boolean;
  subtitle?: string;
  messageInsetClassName?: string;
  isStarred?: boolean;
  isStarPending?: boolean;
  onToggleStar?: (nodeId: string) => void;
  onEditNode?: (node: MessageNode, quoteSelectionText: string) => void;
  isCanvasDiffTagged?: boolean;
  onTagCanvasDiff?: (mergeNodeId: string) => Promise<void>;
  highlighted?: boolean;
  branchQuestionCandidate?: boolean;
  showBranchSplit?: boolean;
  branchActionDisabled?: boolean;
  questionBranchNames?: string[];
  isQuestionBranchesOpen?: boolean;
  questionBranchIndex?: number;
  onToggleQuestionBranches?: (nodeId: string) => void;
  onQuestionBranchIndexChange?: (index: number) => void;
  projectId: string;
  quoteSelectionText?: string;
  highlightMenuPoint?: { x: number; y: number } | null;
  highlightMenuOffset?: number;
  onQuoteReply?: (nodeId: string, messageText: string, selectionText?: string) => void;
};


const chatNodeRowPropsEqual = (prev: ChatNodeRowProps, next: ChatNodeRowProps): boolean => {
  const prevNode = prev.node;
  const nextNode = next.node;
  const sameNodeVisualState =
    prevNode.id === nextNode.id &&
    prevNode.renderId === nextNode.renderId &&
    prevNode.clientState === nextNode.clientState &&
    prevNode.type === nextNode.type &&
    prevNode.timestamp === nextNode.timestamp &&
    (prevNode.type !== 'message' ||
      (nextNode.type === 'message' &&
        prevNode.role === nextNode.role &&
        prevNode.content === nextNode.content &&
        prevNode.contentBlocks === nextNode.contentBlocks &&
        prevNode.thinking === nextNode.thinking &&
        prevNode.interrupted === nextNode.interrupted)) &&
    (prevNode.type !== 'merge' ||
      (nextNode.type === 'merge' &&
        prevNode.mergedAssistantContent === nextNode.mergedAssistantContent &&
        prevNode.canvasDiff === nextNode.canvasDiff));

  const sameQuestionBranchList =
    prev.questionBranchNames?.length === next.questionBranchNames?.length &&
    (prev.questionBranchNames ?? []).every((name, index) => name === (next.questionBranchNames ?? [])[index]);

  return (
    sameNodeVisualState &&
    prev.trunkName === next.trunkName &&
    prev.currentBranchName === next.currentBranchName &&
    prev.defaultProvider === next.defaultProvider &&
    prev.providerByBranch === next.providerByBranch &&
    prev.branchColors === next.branchColors &&
    prev.muted === next.muted &&
    prev.subtitle === next.subtitle &&
    prev.messageInsetClassName === next.messageInsetClassName &&
    prev.isStarred === next.isStarred &&
    prev.isStarPending === next.isStarPending &&
    prev.isCanvasDiffTagged === next.isCanvasDiffTagged &&
    prev.highlighted === next.highlighted &&
    prev.branchQuestionCandidate === next.branchQuestionCandidate &&
    prev.showBranchSplit === next.showBranchSplit &&
    prev.branchActionDisabled === next.branchActionDisabled &&
    sameQuestionBranchList &&
    prev.isQuestionBranchesOpen === next.isQuestionBranchesOpen &&
    prev.questionBranchIndex === next.questionBranchIndex &&
    prev.projectId === next.projectId &&
    prev.quoteSelectionText === next.quoteSelectionText &&
    prev.highlightMenuOffset === next.highlightMenuOffset &&
    prev.highlightMenuPoint?.x === next.highlightMenuPoint?.x &&
    prev.highlightMenuPoint?.y === next.highlightMenuPoint?.y &&
    prev.onToggleStar === next.onToggleStar &&
    prev.onEditNode === next.onEditNode &&
    prev.onTagCanvasDiff === next.onTagCanvasDiff &&
    prev.onToggleQuestionBranches === next.onToggleQuestionBranches &&
    prev.onQuestionBranchIndexChange === next.onQuestionBranchIndexChange &&
    prev.onQuoteReply === next.onQuoteReply
  );
};

const ChatNodeRowBase: FC<ChatNodeRowProps> = ({
  node,
  trunkName,
  currentBranchName,
  defaultProvider,
  providerByBranch,
  branchColors,
  muted,
  subtitle,
  messageInsetClassName,
  isStarred,
  isStarPending,
  onToggleStar,
  onEditNode,
  isCanvasDiffTagged,
  onTagCanvasDiff,
  highlighted,
  branchQuestionCandidate,
  showBranchSplit,
  branchActionDisabled,
  questionBranchNames,
  isQuestionBranchesOpen = false,
  questionBranchIndex = 0,
  onToggleQuestionBranches,
  onQuestionBranchIndexChange,
  projectId,
  quoteSelectionText,
  highlightMenuPoint,
  highlightMenuOffset,
  onQuoteReply
}) => {
  const renderId = node.renderId ?? node.id;
  const isUser = node.type === 'message' && node.role === 'user';
  const isMerge = node.type === 'merge';
  const nodeBranch = node.createdOnBranch ?? currentBranchName;
  const nodeProvider = normalizeProviderForUi(providerByBranch[nodeBranch] ?? defaultProvider);
  const showOpenAiThinkingNote = nodeProvider === 'openai';
  const stripeColor = getBranchColor(node.createdOnBranch ?? trunkName, trunkName, branchColors);
  const questionBranches = questionBranchNames ?? [];
  const activeQuestionBranch =
    questionBranches.length > 0
      ? questionBranches[Math.min(questionBranchIndex, questionBranches.length - 1)]
      : null;
  const rowRef = useRef<HTMLDivElement | null>(null);

  const handleToggleStar = useCallback(() => {
    onToggleStar?.(node.id);
  }, [node.id, onToggleStar]);

  const handleEditNode = useCallback(() => {
    if (node.type !== 'message') return;
    onEditNode?.(node, quoteSelectionText ?? '');
  }, [node, onEditNode, quoteSelectionText]);

  const handleToggleQuestionBranches = useCallback(() => {
    onToggleQuestionBranches?.(node.id);
  }, [node.id, onToggleQuestionBranches]);

  return (
    <div
      className="grid min-w-0 grid-cols-[14px_1fr] items-stretch"
      data-node-id={node.id}
      data-render-id={renderId}
    >
      <div className="flex justify-center">
        <div
          data-testid="chat-row-stripe"
          className="h-full w-1"
          style={{ backgroundColor: stripeColor, opacity: 0.9 }}
        />
      </div>
      <div
        className={`min-w-0 py-2 ${messageInsetClassName ?? ''} ${
          isMerge ? 'flex justify-center' : isUser ? 'flex justify-end' : 'flex justify-start'
        }`}
      >
        <div ref={rowRef} className="relative flex w-full flex-col">
          <NodeBubble
            node={node}
            muted={muted}
            subtitle={subtitle}
            isStarred={isStarred}
            isStarPending={isStarPending}
            onToggleStar={onToggleStar ? handleToggleStar : undefined}
            onEdit={onEditNode ? handleEditNode : undefined}
            isCanvasDiffTagged={isCanvasDiffTagged}
            onTagCanvasDiff={onTagCanvasDiff}
            highlighted={!!highlighted}
            branchQuestionCandidate={branchQuestionCandidate}
            showOpenAiThinkingNote={showOpenAiThinkingNote}
            branchActionDisabled={branchActionDisabled}
            questionBranchCount={questionBranches.length}
            isQuestionBranchesOpen={isQuestionBranchesOpen}
            onToggleQuestionBranches={onToggleQuestionBranches ? handleToggleQuestionBranches : undefined}
            quoteSelectionText={quoteSelectionText}
            highlightMenuPoint={highlightMenuPoint}
            highlightMenuOffset={highlightMenuOffset}
            onQuoteReply={onQuoteReply}
          />
          {isQuestionBranchesOpen && activeQuestionBranch ? (
            <QuestionBranchModal
              projectId={projectId}
              branchName={activeQuestionBranch}
              index={questionBranchIndex}
              total={questionBranches.length}
              onClose={handleToggleQuestionBranches}
              onPrevious={() =>
                onQuestionBranchIndexChange?.(
                  (questionBranchIndex - 1 + questionBranches.length) % questionBranches.length
                )
              }
              onNext={() =>
                onQuestionBranchIndexChange?.((questionBranchIndex + 1) % questionBranches.length)
              }
            />
          ) : null}
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

const ChatNodeRow = React.memo(ChatNodeRowBase, chatNodeRowPropsEqual);

const withLeaseSessionId = <T extends Record<string, unknown>>(payload: T, leaseSessionId?: string | null): T | (T & { leaseSessionId: string }) => {
  if (!leaseSessionId) {
    return payload;
  }
  return { ...payload, leaseSessionId };
};

export function WorkspaceClient({
  project,
  initialBranches,
  defaultProvider,
  providerOptions,
  openAIUseResponses,
  storeMode
}: WorkspaceClientProps) {
  const CHAT_WIDTH_KEY = storageKey(`chat-width:${project.id}`);
  const isPgMode = storeMode === 'pg';
  const [branchName, setBranchName] = useState(project.branchName ?? 'main');
  const [branches, setBranches] = useState(initialBranches);
  const [branchActionError, setBranchActionError] = useState<string | null>(null);
  const [chatComposerError, setChatComposerError] = useState<string | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [branchModalMode, setBranchModalMode] = useState<'standard' | 'question'>('standard');
  const [pendingPinBranchIds, setPendingPinBranchIds] = useState<Set<string>>(new Set());
  const [pendingVisibilityBranchIds, setPendingVisibilityBranchIds] = useState<Set<string>>(new Set());
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget] = useState<BranchSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeSummary, setMergeSummary] = useState('');
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showCreateWorkspaceModal, setShowCreateWorkspaceModal] = useState(false);
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
  const [switchToEditBranch, setSwitchToEditBranch] = useState(true);
  const [editProvider, setEditProvider] = useState<LLMProvider>(normalizeProviderForUi(defaultProvider));
  const [editThinking, setEditThinking] = useState<ThinkingSetting>('medium');
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimeoutsRef = useRef<Map<string, number>>(new Map());
  const { sessionId: leaseSessionId, ready: leaseSessionReady } = useLeaseSession(project.id, isPgMode);
  const shareUiVisible =
    isPgMode &&
    (features.uiShareMode === 'all' || (features.uiShareMode === 'admins' && Boolean(project.isOwner)));
  const canShare = isPgMode && Boolean(project.isOwner);
  const isSharedWorkspace = project.isOwner === false;
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer');
  const [shareError, setShareError] = useState<string | null>(null);
  const [isShareSaving, setIsShareSaving] = useState(false);
  const [pendingShareIds, setPendingShareIds] = useState<Set<string>>(new Set());
  const [isReleasingLease, setIsReleasingLease] = useState(false);
  const [showBranchSettings, setShowBranchSettings] = useState(false);
  const [openBranchMenu, setOpenBranchMenu] = useState<string | null>(null);
  const branchSettingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const branchSettingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const branchMenuRefs = useRef<Map<string, React.RefObject<HTMLButtonElement>>>(new Map());
  const [artefactDraft, setArtefactDraft] = useState('');
  const [isSavingArtefact, setIsSavingArtefact] = useState(false);
  const [artefactError, setArtefactError] = useState<string | null>(null);
  const [newBranchProvider, setNewBranchProvider] = useState<LLMProvider>(normalizeProviderForUi(defaultProvider));
  const [newBranchThinking, setNewBranchThinking] = useState<ThinkingSetting>('medium');
  const [newBranchQuestion, setNewBranchQuestion] = useState('');
  const [newBranchHighlight, setNewBranchHighlight] = useState('');
  const [switchToNewBranch, setSwitchToNewBranch] = useState(false);
  const [questionBranchesByNode, setQuestionBranchesByNode] = useState<Record<string, QuestionBranchRef[]>>({});
  const [openQuestionBranchNodeId, setOpenQuestionBranchNodeId] = useState<string | null>(null);
  const [openQuestionBranchIndex, setOpenQuestionBranchIndex] = useState(0);
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
  const railStateRef = useRef<RailLayoutContext | null>(null);
  const collapseSnapshotRef = useRef<{
    railCollapsed: boolean;
    insightCollapsed: boolean;
    composerCollapsed: boolean;
  } | null>(null);
  const paneContainerRef = useRef<HTMLDivElement | null>(null);
  const insightPaneRef = useRef<HTMLDivElement | null>(null);
  const isResizingRef = useRef(false);
  const savedChatPaneWidthRef = useRef<number | null>(null);
  const [graphHistories, setGraphHistories] = useState<Record<string, NodeRecord[]> | null>(null);
  const [graphViews, setGraphViews] = useState<GraphViews | null>(null);
  const [graphHistoryError, setGraphHistoryError] = useState<string | null>(null);
  const [graphHistoryLoading, setGraphHistoryLoading] = useState(false);
  const [graphMode, setGraphMode] = useState<'nodes' | 'collapsed' | 'starred'>('collapsed');
  const [composerPadding, setComposerPadding] = useState(128);
  const composerExpandedPaddingRef = useRef(128);
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const isGraphVisible = !insightCollapsed && insightTab === 'graph';
  const branchLookup = useMemo(() => {
    const nameById = new Map<string, string>();
    const idByName = new Map<string, string>();
    const identityByName = new Map<string, string>();
    for (const branch of branches) {
      identityByName.set(branch.name, branch.id ?? branch.name);
      if (branch.id) {
        nameById.set(branch.id, branch.name);
        idByName.set(branch.name, branch.id);
      }
    }
    return { nameById, idByName, identityByName };
  }, [branches]);
  const getBranchIdentity = useCallback(
    (branch: BranchSummary) => branchLookup.identityByName.get(branch.name) ?? branch.name,
    [branchLookup]
  );
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
  const COLLAPSED_COMPOSER_PADDING = 12;
  const composerHandleRef = useRef<WorkspaceComposerHandle | null>(null);

  const getSelectionForNode = useCallback((nodeId: string): string => {
    if (typeof window === 'undefined') return '';
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return '';
    const text = selection.toString().trim();
    if (!text) return '';
    const container = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!container) return '';
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    if (anchor && focus && container.contains(anchor) && container.contains(focus)) {
      return text;
    }
    return '';
  }, []);

  const getSelectionContext = useCallback((): { nodeId: string; text: string } | null => {
    if (typeof window === 'undefined') return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;
    const text = selection.toString().trim();
    if (!text) return null;
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    const anchorEl = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const focusEl = focusNode instanceof Element ? focusNode : focusNode?.parentElement;
    if (!anchorEl || !focusEl) return null;
    const anchorContainer = anchorEl.closest('[data-node-id]');
    const focusContainer = focusEl.closest('[data-node-id]');
    if (!anchorContainer || anchorContainer !== focusContainer) return null;
    const anchorContent = anchorEl.closest('[data-message-content]');
    const focusContent = focusEl.closest('[data-message-content]');
    if (!anchorContent || anchorContent !== focusContent) return null;
    const nodeId = anchorContainer.getAttribute('data-node-id');
    if (!nodeId) return null;
    return { nodeId, text };
  }, []);

  const resetBranchQuestionState = useCallback(() => {
    setBranchSplitNodeId(null);
    setNewBranchHighlight('');
    setNewBranchQuestion('');
    setSwitchToNewBranch(false);
    setBranchModalMode('standard');
  }, []);

  const buildModalBackdropHandler = useCallback(
    (onClose: () => void) =>
      (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeout = toastTimeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutsRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (tone: ToastTone, message: string) => {
      const id = createClientId();
      setToasts((prev) => [...prev, { id, tone, message }]);
      const timeout = window.setTimeout(() => {
        removeToast(id);
      }, 4500);
      toastTimeoutsRef.current.set(id, timeout);
    },
    [removeToast]
  );

  const ensureLeaseSessionReady = useCallback(() => {
    if (!isPgMode) return true;
    if (!leaseSessionReady || !leaseSessionId) {
      pushToast('error', 'Editing session is still initializing. Please try again in a moment.');
      return false;
    }
    return true;
  }, [isPgMode, leaseSessionId, leaseSessionReady, pushToast]);

  const resolveQuestionBranchName = useCallback(
    (entry: QuestionBranchRef) => {
      if (entry.refId) {
        return branchLookup.nameById.get(entry.refId) ?? entry.refName;
      }
      return entry.refName;
    },
    [branchLookup]
  );

  const resolveQuestionBranchNames = useCallback(
    (entries: QuestionBranchRef[]) => entries.map(resolveQuestionBranchName),
    [resolveQuestionBranchName]
  );
  const missingQuestionBranchForkWarningRef = useRef<Set<string>>(new Set());

  const addQuestionBranchForNode = useCallback(
    (nodeId: string | null | undefined, branchName: string) => {
      if (!nodeId) return;
      const key = String(nodeId);
      const refId = branchLookup.idByName.get(branchName) ?? null;
      setQuestionBranchesByNode((prev) => {
        const existing = prev[key] ?? [];
        const alreadyTracked = refId
          ? existing.some((entry) => entry.refId === refId)
          : existing.some((entry) => entry.refName === branchName);
        if (alreadyTracked) {
          return prev;
        }
        return { ...prev, [key]: [...existing, { refId, refName: branchName }] };
      });
    },
    [branchLookup]
  );

  const rehydrateQuestionBranches = useCallback(
    (histories: Record<string, NodeRecord[]>) => {
      for (const [branchName, nodes] of Object.entries(histories)) {
        if (!isQuestionBranchHistory(nodes, branchName)) continue;
        const forkParentId = deriveForkParentNodeId(histories, branchName);
        if (!forkParentId) {
          const warned = missingQuestionBranchForkWarningRef.current;
          if (!warned.has(branchName)) {
            warned.add(branchName);
            console.warn(`[workspace] question branch rehydrate missing fork parent for ${branchName}`);
          }
          continue;
        }
        addQuestionBranchForNode(forkParentId, branchName);
      }
    },
    [addQuestionBranchForNode]
  );

  useEffect(() => {
    setQuestionBranchesByNode((prev) => {
      let changed = false;
      const next: Record<string, QuestionBranchRef[]> = {};
      for (const [nodeId, entries] of Object.entries(prev)) {
        const updated = entries.map((entry) => {
          if (entry.refId) return entry;
          const resolvedId = branchLookup.idByName.get(entry.refName);
          if (!resolvedId) return entry;
          changed = true;
          return { ...entry, refId: resolvedId };
        });
        next[nodeId] = updated;
      }
      return changed ? next : prev;
    });
  }, [branchLookup]);

  const toggleQuestionBranchesForNode = useCallback((nodeId: string) => {
    setOpenQuestionBranchIndex(0);
    setOpenQuestionBranchNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  useEffect(() => {
    if (!openQuestionBranchNodeId) return;
    const branches = questionBranchesByNode[openQuestionBranchNodeId] ?? [];
    if (branches.length === 0) {
      setOpenQuestionBranchNodeId(null);
      setOpenQuestionBranchIndex(0);
      return;
    }
    if (openQuestionBranchIndex > branches.length - 1) {
      setOpenQuestionBranchIndex(0);
    }
  }, [openQuestionBranchIndex, openQuestionBranchNodeId, questionBranchesByNode]);

  useEffect(() => {
    if (!openQuestionBranchNodeId) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('[data-question-branches-modal="true"]') ||
        target.closest('[data-question-branches-button="true"]')
      ) {
        return;
      }
      setOpenQuestionBranchNodeId(null);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [openQuestionBranchNodeId]);

  useEffect(() => {
    return () => {
      for (const timeout of toastTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      toastTimeoutsRef.current.clear();
    };
  }, []);

  const startBackgroundTask = useCallback((task: Omit<BackgroundTask, 'id'>) => {
    const id = createClientId();
    setBackgroundTasks((prev) => [...prev, { id, ...task }]);
    return id;
  }, []);

  const finishBackgroundTask = useCallback((id: string) => {
    setBackgroundTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const openEditModal = (node: MessageNode, highlightText?: string) => {
    if (branchActionDisabled) {
      pushToast('info', 'Branching is disabled while streaming.');
      return;
    }
    if (node.role === 'assistant') {
      const selectionText = highlightText?.trim() || getSelectionForNode(node.id);
      if (selectionText) {
        if (showNewBranchModal && branchSplitNodeId === node.id && branchModalMode === 'question') {
          setShowNewBranchModal(false);
          resetBranchQuestionState();
          return;
        }
        setShowNewBranchModal(false);
        resetBranchQuestionState();
        setBranchActionError(null);
        setNewBranchProvider(normalizeProviderForUi(branchProvider));
        setNewBranchThinking(thinking);
        setNewBranchName(buildQuestionBranchName(selectionText));
        setBranchSplitNodeId(node.id);
        setNewBranchHighlight(selectionText);
        setNewBranchQuestion('');
        setSwitchToNewBranch(false);
        setBranchModalMode('question');
        setShowNewBranchModal(true);
        return;
      }
      if (showNewBranchModal && branchSplitNodeId === node.id && branchModalMode === 'standard') {
        setShowNewBranchModal(false);
        resetBranchQuestionState();
        return;
      }
      setShowNewBranchModal(false);
      resetBranchQuestionState();
      setBranchActionError(null);
      setNewBranchName('');
      setBranchSplitNodeId(node.id);
      setBranchModalMode('standard');
      setShowNewBranchModal(true);
      return;
    }
    if (showNewBranchModal) {
      setShowNewBranchModal(false);
      resetBranchQuestionState();
    }
    setBranchSplitNodeId(null);
    setEditingNode(node);
    setEditDraft(node.content);
    setEditBranchName('');
    setEditError(null);
    setEditProvider(normalizeProviderForUi(branchProvider));
    setEditThinking(thinking);
    setSwitchToEditBranch(true);
    setShowEditModal(true);
  };

  const openRenameModal = (branch: BranchSummary) => {
    setRenameTarget(branch);
    setRenameValue(branch.name);
    setRenameError(null);
    setShowRenameModal(true);
  };

  const closeNewBranchModal = useCallback(() => {
    setShowNewBranchModal(false);
    resetBranchQuestionState();
  }, [resetBranchQuestionState]);

  const closeRenameModal = useCallback(() => {
    if (isRenaming) return;
    setShowRenameModal(false);
    setRenameTarget(null);
    setRenameValue('');
    setRenameError(null);
  }, [isRenaming]);

  const resetEditState = useCallback(() => {
    setShowEditModal(false);
    setEditDraft('');
    setEditBranchName('');
    setEditingNode(null);
    setEditError(null);
    setSwitchToEditBranch(true);
  }, []);

  const closeEditModal = useCallback(() => {
    if (isEditing) return;
    resetEditState();
  }, [isEditing, resetEditState]);

  const closeShareModal = useCallback(() => {
    if (isShareSaving) return;
    setShowShareModal(false);
    setShareEmail('');
    setShareRole('viewer');
    setShareError(null);
    setPendingShareIds(new Set());
  }, [isShareSaving]);

  const closeCreateWorkspaceModal = useCallback(() => {
    setShowCreateWorkspaceModal(false);
  }, []);
  const closeBranchSettings = useCallback(() => {
    setShowBranchSettings(false);
  }, []);

  const {
    data: starsData,
    mutate: mutateStars
  } = useSWR<{ starredNodeIds: string[] }>(`/api/projects/${project.id}/stars`, fetchJson, { revalidateOnFocus: true });
  const {
    data: shareData,
    error: shareLoadError,
    mutate: mutateShare
  } = useSWR<{ members: ProjectMember[]; invites: ProjectInvite[] }>(
    canShare && showShareModal ? `/api/projects/${project.id}/members` : null,
    fetchJson,
    { revalidateOnFocus: true }
  );
  const {
    data: leaseData,
    mutate: mutateLeases
  } = useSWR<{ leases: RefLease[] }>(
    isPgMode ? `/api/projects/${project.id}/leases` : null,
    fetchJson,
    { revalidateOnFocus: true, refreshInterval: 10000 }
  );

  const starredNodeIds = starsData?.starredNodeIds ?? [];
  const starredKey = useMemo(() => [...new Set(starredNodeIds)].sort().join('|'), [starredNodeIds]);
  const stableStarredNodeIds = useMemo(() => (starredKey ? starredKey.split('|') : []), [starredKey]);
  const starredSet = useMemo(() => new Set(stableStarredNodeIds), [stableStarredNodeIds]);
  const shareMembers = shareData?.members ?? [];
  const shareInvites = shareData?.invites ?? [];
  const shareEmailTrimmed = shareEmail.trim();
  const isShareEmailValid = useMemo(() => {
    if (!shareEmailTrimmed) return true;
    return isValidEmail(shareEmailTrimmed);
  }, [shareEmailTrimmed]);
  const leasesByRefId = useMemo(() => {
    const map = new Map<string, RefLease>();
    for (const lease of leaseData?.leases ?? []) {
      map.set(lease.refId, lease);
    }
    return map;
  }, [leaseData]);
  const getLeaseForBranchName = useCallback(
    (name: string) => {
      const branch = branches.find((entry) => entry.name === name);
      const lease = branch?.id ? leasesByRefId.get(branch.id) ?? null : null;
      return { branch, lease };
    },
    [branches, leasesByRefId]
  );

  const updateShareData = useCallback(
    async (data: { members: ProjectMember[]; invites: ProjectInvite[] }) => {
      await mutateShare(data, false);
    },
    [mutateShare]
  );

  const submitShareInvite = useCallback(async () => {
    const trimmedEmail = shareEmail.trim();
    if (!trimmedEmail) {
      setShareError('Email is required.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setShareError('Enter a valid email address.');
      return;
    }
    setIsShareSaving(true);
    setShareError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, role: shareRole })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to send invite');
      }
      const data = (await res.json()) as { members: ProjectMember[]; invites: ProjectInvite[] };
      await updateShareData(data);
      setShareEmail('');
      pushToast('success', 'Invite sent.');
    } catch (err) {
      setShareError((err as Error).message);
    } finally {
      setIsShareSaving(false);
    }
  }, [project.id, pushToast, shareEmail, shareRole, updateShareData]);

  const updateShareRole = useCallback(
    async (payload: { type: 'member' | 'invite'; id: string; role: 'viewer' | 'editor' }) => {
      setShareError(null);
      setPendingShareIds((prev) => new Set(prev).add(payload.id));
      try {
        const res = await fetch(`/api/projects/${project.id}/members`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message ?? 'Failed to update role');
        }
        const data = (await res.json()) as { members: ProjectMember[]; invites: ProjectInvite[] };
        await updateShareData(data);
        pushToast('success', 'Role updated.');
      } catch (err) {
        setShareError((err as Error).message);
      } finally {
        setPendingShareIds((prev) => {
          const next = new Set(prev);
          next.delete(payload.id);
          return next;
        });
      }
    },
    [project.id, pushToast, updateShareData]
  );

  const removeShareEntry = useCallback(
    async (payload: { type: 'member' | 'invite'; id: string }) => {
      setShareError(null);
      setPendingShareIds((prev) => new Set(prev).add(payload.id));
      try {
        const res = await fetch(`/api/projects/${project.id}/members`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message ?? 'Failed to remove entry');
        }
        const data = (await res.json()) as { members: ProjectMember[]; invites: ProjectInvite[] };
        await updateShareData(data);
        pushToast('success', payload.type === 'member' ? 'Member removed.' : 'Invite revoked.');
      } catch (err) {
        setShareError((err as Error).message);
      } finally {
        setPendingShareIds((prev) => {
          const next = new Set(prev);
          next.delete(payload.id);
          return next;
        });
      }
    },
    [project.id, pushToast, updateShareData]
  );

  const releaseLease = useCallback(
    async (payload: { refId: string; force?: boolean }) => {
      if (!ensureLeaseSessionReady()) return;
      setIsReleasingLease(true);
      try {
        const res = await fetch(`/api/projects/${project.id}/leases`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            withLeaseSessionId(
              {
                refId: payload.refId,
                force: payload.force ?? false
              },
              leaseSessionId
            )
          )
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message ?? 'Failed to unlock editing');
        }
        const data = (await res.json()) as { leases: RefLease[] };
        await mutateLeases(data, false);
        pushToast('success', 'Edit lock released.');
      } catch (err) {
        pushToast('error', (err as Error).message);
      } finally {
        setIsReleasingLease(false);
      }
    },
    [ensureLeaseSessionReady, leaseSessionId, mutateLeases, project.id, pushToast]
  );
  const [pendingStarIds, setPendingStarIds] = useState<Set<string>>(new Set());

  const toggleStar = useCallback(async (nodeId: string) => {
    setPendingStarIds((prev) => new Set(prev).add(nodeId));
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
    } finally {
      setPendingStarIds((prevSet) => {
        const nextSet = new Set(prevSet);
        nextSet.delete(nodeId);
        return nextSet;
      });
    }
  }, [mutateStars, project.id, stableStarredNodeIds, starredSet]);

  const openEditModalRef = useRef(openEditModal);
  useEffect(() => {
    openEditModalRef.current = openEditModal;
  }, [openEditModal]);

  const { nodes, artefact, artefactMeta, isLoading, error, mutateHistory, mutateArtefact } = useProjectData(project.id, {
    ref: branchName
  });
  const HAS_SENT_MESSAGE_KEY = storageKey('user-has-sent-message');
  const [hasEverSentMessage, setHasEverSentMessage] = useState(false);
  const [hasEverSentMessageHydrated, setHasEverSentMessageHydrated] = useState(false);
  const hasSentMessage = useMemo(
    () => nodes.some((node) => node.type === 'message' && node.role === 'user'),
    [nodes]
  );
  const isNewUser = !hasEverSentMessage;
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const refreshHistory = useCallback(async () => {
    await mutateHistory();
    setHistoryEpoch((value) => value + 1);
  }, [mutateHistory]);
  const refreshCoreData = useCallback(() => {
    void Promise.allSettled([refreshHistory(), mutateArtefact()]);
  }, [refreshHistory, mutateArtefact]);
  useEffect(() => {
    const controller = new AbortController();
    const loadQuestionBranchGraph = async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/graph?includeHidden=true`, { signal: controller.signal });
        if (!res.ok) {
          throw new Error('Failed to load graph');
        }
        const data = (await res.json()) as { branchHistories?: Record<string, NodeRecord[]> };
        if (!data.branchHistories) return;
        rehydrateQuestionBranches(data.branchHistories);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[workspace] question branch rehydrate failed', err);
      }
    };
    void loadQuestionBranchGraph();
    return () => controller.abort();
  }, [project.id, rehydrateQuestionBranches]);
  const clearPendingAutosave = useCallback(() => {
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    if (autosaveControllerRef.current) {
      autosaveControllerRef.current.abort();
      autosaveControllerRef.current = null;
    }
    if (autosaveSpinnerTimeoutRef.current) {
      clearTimeout(autosaveSpinnerTimeoutRef.current);
      autosaveSpinnerTimeoutRef.current = null;
    }
    autosaveSpinnerUntilRef.current = null;
    setIsSavingArtefact(false);
  }, []);
  const saveArtefactSnapshot = useCallback(
    async ({ content, ref }: { content: string; ref: string }) => {
      if (isPgMode) {
        if (!leaseSessionReady || !leaseSessionId) {
          setArtefactError('Editing session is still initializing. Please try again.');
          return false;
        }
        const { lease } = getLeaseForBranchName(ref);
        if (lease && lease.holderSessionId !== leaseSessionId) {
          setArtefactError('Editing locked. Editor access required.');
          return false;
        }
      }
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
      try {
        const res = await fetch(`/api/projects/${project.id}/artefact?ref=${encodeURIComponent(ref)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withLeaseSessionId({ content }, leaseSessionId)),
          signal: controller.signal
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message ?? 'Failed to save canvas');
        }
        if (ref === branchName) {
          await mutateArtefact();
        }
        return true;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return false;
        setArtefactError((err as Error).message);
        return false;
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
    },
    [branchName, getLeaseForBranchName, isPgMode, leaseSessionId, leaseSessionReady, mutateArtefact, project.id]
  );
  const scheduleAutosave = useCallback(
    ({ content, ref }: { content: string; ref: string }) => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      autosaveTimeoutRef.current = setTimeout(() => {
        void saveArtefactSnapshot({ content, ref });
      }, 2000);
    },
    [saveArtefactSnapshot]
  );
  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.confirm('Canvas changes could not be saved. Switch branches and discard those changes?');
  }, []);
  const ensureCanvasSavedForBranchSwitch = useCallback(async () => {
    if (artefactDraft === artefact) return true;
    clearPendingAutosave();
    const saved = await saveArtefactSnapshot({ content: artefactDraft, ref: branchName });
    if (saved) return true;
    const discard = confirmDiscardUnsavedChanges();
    if (!discard) {
      scheduleAutosave({ content: artefactDraft, ref: branchName });
    }
    return discard;
  }, [
    artefact,
    artefactDraft,
    branchName,
    clearPendingAutosave,
    confirmDiscardUnsavedChanges,
    saveArtefactSnapshot,
    scheduleAutosave
  ]);
  const draftStorageKey = `researchtree:draft:${project.id}`;
  const [optimisticUserNode, setOptimisticUserNode] = useState<NodeRecord | null>(null);
  const optimisticDraftRef = useRef<string | null>(null);
  const questionDraftRef = useRef<string | null>(null);
  const [assistantLifecycle, setAssistantLifecycle] = useState<AssistantLifecycle>('idle');
  const [streamMeta, setStreamMeta] = useState<StreamMeta | null>(null);
  const [streamCache, setStreamCache] = useState<{ preview: string; blocks: ThinkingContentBlock[] } | null>(null);
  const assistantPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [streamBlocks, setStreamBlocks] = useState<ThinkingContentBlock[]>([]);
  const streamBlocksRef = useRef<ThinkingContentBlock[]>([]);
  const hasReceivedAssistantChunkRef = useRef(false);
  const [streamPreview, setStreamPreview] = useState('');
  const streamPreviewRef = useRef('');
  const streamBranchRef = useRef<string | null>(null);
  const renderIdByNodeIdRef = useRef<Map<string, string>>(new Map());
  const turnUserRenderIdRef = useRef<string | null>(null);
  const turnAssistantRenderIdRef = useRef<string | null>(null);
  const [streamHoldPending, setStreamHoldPending] = useState<{
    content: string;
    contentBlocks: ThinkingContentBlock[];
    branch: string;
  } | null>(null);
  const [streamHold, setStreamHold] = useState<{
    targetId: string;
    content: string;
    contentBlocks: ThinkingContentBlock[];
    branch: string;
  } | null>(null);
  const beginTurn = (params: {
    content: string;
    branch: string;
    createdOnBranch: string;
    parent: string | null;
    optimisticDraft: string | null;
    questionDraft: string | null;
    requiresUserMatch: boolean;
  }) => {
    const { content, branch, createdOnBranch, parent, optimisticDraft, questionDraft, requiresUserMatch } = params;
    setStreamHold(null);
    setStreamHoldPending(null);
    streamBranchRef.current = branch;
    setStreamPreview('');
    streamPreviewRef.current = '';
    optimisticDraftRef.current = optimisticDraft;
    questionDraftRef.current = questionDraft;
    turnUserRenderIdRef.current = createClientId();
    turnAssistantRenderIdRef.current = createClientId();
    setStreamBlocks([]);
    streamBlocksRef.current = [];
    hasReceivedAssistantChunkRef.current = false;
    setAssistantLifecycle('idle');
    const clientRequestId = createClientId();
    setStreamMeta({ branch, startedAt: Date.now(), clientRequestId, requiresUserMatch });
    if (assistantPendingTimerRef.current) {
      clearTimeout(assistantPendingTimerRef.current);
      assistantPendingTimerRef.current = null;
    }
    setOptimisticUserNode({
      id: 'optimistic-user',
      type: 'message',
      role: 'user',
      content,
      contentBlocks: [{ type: 'text', text: content }],
      clientRequestId,
      timestamp: Date.now(),
      parent,
      createdOnBranch
    });
    assistantPendingTimerRef.current = setTimeout(() => {
      setAssistantLifecycle('pending');
      assistantPendingTimerRef.current = null;
    }, 100);
    return clientRequestId;
  };
  const activeBranch = useMemo(() => branches.find((branch) => branch.name === branchName), [branches, branchName]);
  const activeBranchLease = useMemo(() => {
    if (!activeBranch?.id) return null;
    const lease = leasesByRefId.get(activeBranch.id);
    if (lease) return lease;
    if (activeBranch.leaseHolderSessionId) {
      return {
        refId: activeBranch.id,
        holderUserId: activeBranch.leaseHolderUserId ?? '',
        holderSessionId: activeBranch.leaseHolderSessionId ?? '',
        expiresAt: activeBranch.leaseExpiresAt ?? ''
      };
    }
    return null;
  }, [activeBranch?.id, activeBranch?.leaseExpiresAt, activeBranch?.leaseHolderSessionId, activeBranch?.leaseHolderUserId, leasesByRefId]);
  const leaseHeldBySession = useMemo(
    () => Boolean(activeBranchLease && activeBranchLease.holderSessionId === leaseSessionId),
    [activeBranchLease, leaseSessionId]
  );
  const leaseLocked = useMemo(
    () => Boolean(activeBranchLease && activeBranchLease.holderSessionId !== leaseSessionId),
    [activeBranchLease, leaseSessionId]
  );
  const isBranchWriteLocked = isPgMode && leaseLocked;
  const branchProvider = useMemo(
    () => activeBranch?.provider ?? defaultProvider,
    [activeBranch?.provider, defaultProvider]
  );
  const branchModel = useMemo(() => {
    const option = providerOptions.find((entry) => entry.id === branchProvider);
    return activeBranch?.model ?? option?.defaultModel ?? getDefaultModelForProviderFromCapabilities(branchProvider);
  }, [activeBranch?.model, branchProvider, providerOptions]);
  const [thinking, setThinking] = useState<ThinkingSetting>(() => getDefaultThinkingSetting(branchProvider, branchModel));
  const thinkingStorageKey = useMemo(
    () => `researchtree:thinking:${project.id}:${branchName}`,
    [project.id, branchName]
  );
  const [thinkingHydratedKey, setThinkingHydratedKey] = useState<string | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const webSearchStorageKey = useMemo(
    () => `researchtree:websearch:${project.id}:${branchName}`,
    [project.id, branchName]
  );
  const [webSearchHydratedKey, setWebSearchHydratedKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(HAS_SENT_MESSAGE_KEY);
    if (stored === 'true') {
      setHasEverSentMessage(true);
    }
    setHasEverSentMessageHydrated(true);
  }, [HAS_SENT_MESSAGE_KEY]);

  useEffect(() => {
    if (!hasSentMessage) return;
    setHasEverSentMessage(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HAS_SENT_MESSAGE_KEY, 'true');
    }
  }, [hasSentMessage, HAS_SENT_MESSAGE_KEY]);

  const markHasEverSentMessage = useCallback(() => {
    setHasEverSentMessage(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HAS_SENT_MESSAGE_KEY, 'true');
    }
  }, [HAS_SENT_MESSAGE_KEY]);

  const { sendMessage, sendStreamRequest, interrupt, state } = useChatStream({
    projectId: project.id,
    ref: branchName,
    provider: branchProvider,
    thinking,
    webSearch: webSearchEnabled,
    leaseSessionId,
    onChunk: (chunk) => {
      if (!streamBranchRef.current) {
        streamBranchRef.current = branchName;
      }
      if (!hasReceivedAssistantChunkRef.current) {
        hasReceivedAssistantChunkRef.current = true;
        if (assistantPendingTimerRef.current) {
          clearTimeout(assistantPendingTimerRef.current);
          assistantPendingTimerRef.current = null;
        }
        if (DEBUG_ASSISTANT_LIFECYCLE) {
          console.debug('[assistant-lifecycle] first-chunk', {
            branch: branchName,
            streamMeta: streamMeta ?? null
          });
        }
        setAssistantLifecycle('streaming');
      }
      if (streamCache) {
        setStreamCache(null);
      }
      if (chunk.type === 'thinking') {
        setStreamBlocks((prev) => {
          const last = prev[prev.length - 1];
          if (chunk.append && last?.type === 'thinking' && typeof (last as { thinking?: unknown }).thinking === 'string') {
            const updated = { ...last, thinking: `${(last as { thinking: string }).thinking}${chunk.content}` };
            const next = [...prev.slice(0, -1), updated];
            streamBlocksRef.current = next;
            return next;
          }
          const next = [
            ...prev,
            {
              type: 'thinking',
              thinking: chunk.content
            }
          ];
          streamBlocksRef.current = next;
          return next;
        });
        return;
      }
      if (chunk.type === 'thinking_signature') {
        setStreamBlocks((prev) => {
          const next = [
            ...prev,
            {
              type: 'thinking_signature',
              signature: chunk.content
            }
          ];
          streamBlocksRef.current = next;
          return next;
        });
        return;
      }
      setStreamBlocks((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === 'text' && typeof (last as { text?: unknown }).text === 'string') {
          const updated = { ...last, text: `${(last as { text: string }).text}${chunk.content}` };
          const next = [...prev.slice(0, -1), updated];
          streamBlocksRef.current = next;
          return next;
        }
        const next = [...prev, { type: 'text', text: chunk.content }];
        streamBlocksRef.current = next;
        return next;
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
      const finalContent = streamPreviewRef.current;
      const finalBlocks = streamBlocksRef.current;
      if (finalContent || finalBlocks.length > 0) {
        const streamBranch = streamMeta?.branch ?? streamBranchRef.current ?? branchName;
        setStreamHoldPending({ content: finalContent, contentBlocks: finalBlocks, branch: streamBranch });
        setStreamCache({ preview: finalContent, blocks: finalBlocks });
        setAssistantLifecycle('final');
        if (DEBUG_ASSISTANT_LIFECYCLE) {
          console.debug('[assistant-lifecycle] stream-complete', {
            branch: branchName,
            streamBranch,
            previewLength: finalContent.length,
            blocks: finalBlocks.length
          });
        }
      } else {
        setStreamPreview('');
        streamPreviewRef.current = '';
        setStreamBlocks([]);
        streamBlocksRef.current = [];
        streamBranchRef.current = null;
        setAssistantLifecycle('idle');
        setStreamCache(null);
        setStreamMeta(null);
      }
      markHasEverSentMessage();
      if (DEBUG_ASSISTANT_LIFECYCLE) {
        console.debug('[assistant-lifecycle] stream-complete-cleanup-pending', {
          branch: branchName,
          optimisticUserId: optimisticUserNode?.id ?? null
        });
      }
      optimisticDraftRef.current = null;
      questionDraftRef.current = null;
      hasReceivedAssistantChunkRef.current = false;
      if (assistantPendingTimerRef.current) {
        clearTimeout(assistantPendingTimerRef.current);
        assistantPendingTimerRef.current = null;
      }
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
  const providerByBranch = useMemo(() => {
    return branches.reduce<Record<string, LLMProvider>>((acc, branch) => {
      if (branch.provider) {
        acc[branch.name] = branch.provider;
      }
      return acc;
    }, {});
  }, [branches]);

  const activeProviderModel = branchModel;
  const allowedThinking = useMemo(
    () => getAllowedThinkingSettings(branchProvider, activeProviderModel),
    [branchProvider, activeProviderModel]
  );
  const thinkingUnsupportedError =
    !activeProviderModel || allowedThinking.includes(thinking)
      ? null
      : `Thinking: ${THINKING_SETTING_LABELS[thinking]} is not supported for ${branchProviderLabel} (model=${activeProviderModel}).`;
  const leaseStatusError =
    isPgMode && !leaseSessionReady
      ? 'Initializing editing session…'
      : isBranchWriteLocked
        ? 'Editing locked. Editor access required.'
        : null;
  const chatErrorMessage = chatComposerError ?? state.error ?? thinkingUnsupportedError ?? leaseStatusError ?? null;
  const composerInputDisabled = isBranchWriteLocked || (isPgMode && !leaseSessionReady);
  const composerActionDisabled = composerInputDisabled || state.isStreaming;
  const canvasDisabled = isPgMode && (!leaseSessionReady || isBranchWriteLocked);
  const webSearchAvailable = branchProvider !== 'mock';
  const showOpenAISearchNote =
    webSearchEnabled &&
    !openAIUseResponses &&
    (branchProvider === 'openai' || branchProvider === 'openai_responses');

  const sendDraft = useCallback(async (draft: string): Promise<boolean> => {
    if (!draft.trim() || state.isStreaming) return false;
    setChatComposerError(null);
    if (thinkingUnsupportedError) {
      return false;
    }
    if (!ensureLeaseSessionReady()) {
      return false;
    }
    if (isBranchWriteLocked) {
      pushToast('error', 'Editing locked. Editor access required.');
      return false;
    }
    const clientRequestId = beginTurn({
      content: draft,
      branch: branchName,
      createdOnBranch: branchName,
      parent: nodes.length > 0 ? String(nodes[nodes.length - 1]!.id) : null,
      optimisticDraft: draft,
      questionDraft: null,
      requiresUserMatch: true
    });
    await sendMessage({ message: draft, clientRequestId });
    return true;
  }, [
    state.isStreaming,
    thinkingUnsupportedError,
    ensureLeaseSessionReady,
    isBranchWriteLocked,
    pushToast,
    branchName,
    nodes,
    sendMessage
  ]);

  const sendQuestionWithStream = async ({

    targetBranch,
    question,
    highlight,
    provider,
    model,
    thinkingSetting,
    fromRef,
    fromNodeId,
    onResponse,
    onFailure
  }: {
    targetBranch: string;
    question: string;
    highlight?: string;
    provider: LLMProvider;
    model: string;
    thinkingSetting: ThinkingSetting;
    fromRef: string;
    fromNodeId?: string | null;
    onResponse?: () => void;
    onFailure?: () => void;
  }) => {
    if (!question.trim() || state.isStreaming) return;
    if (!ensureLeaseSessionReady()) return;
    const optimisticContent = buildQuestionMessage(question, highlight);
    const clientRequestId = beginTurn({
      content: optimisticContent,
      branch: targetBranch,
      createdOnBranch: targetBranch,
      parent: null,
      optimisticDraft: null,
      questionDraft: optimisticContent,
      requiresUserMatch: true
    });
    let responded = false;
    await sendStreamRequest({
      url: `/api/projects/${project.id}/branch-question`,
      body: withLeaseSessionId(
        {
          name: targetBranch,
          fromRef,
          fromNodeId,
          provider,
          model,
          question,
          highlight,
          thinking: thinkingSetting,
          switch: true,
          clientRequestId
        },
        leaseSessionId
      ),
      onResponse: () => {
        responded = true;
        addQuestionBranchForNode(fromNodeId, targetBranch);
        onResponse?.();
      },
      debugLabel: 'branch-question'
    });
    if (!responded) {
      onFailure?.();
    }
  };

  const sendEditWithStream = async ({
    targetBranch,
    content,
    fromRef,
    nodeId,
    provider,
    model,
    thinkingSetting,
    onResponse,
    onFailure
  }: {
    targetBranch: string;
    content: string;
    fromRef: string;
    nodeId: string;
    provider: LLMProvider;
    model: string;
    thinkingSetting: ThinkingSetting;
    onResponse?: () => void;
    onFailure?: () => void;
  }) => {
    if (!content.trim() || state.isStreaming) return;
    if (!ensureLeaseSessionReady()) return;
    if (isPgMode) {
      const { lease } = getLeaseForBranchName(targetBranch);
      if (lease && lease.holderSessionId !== leaseSessionId) {
        pushToast('error', 'Editing locked. Editor access required.');
        return;
      }
    }
    const targetNode = nodes.find((node) => node.id === nodeId);
    const requiresUserMatch =
      targetNode?.type === 'message' && targetNode.role === 'user';
    const clientRequestId = beginTurn({
      content,
      branch: targetBranch,
      createdOnBranch: targetBranch,
      parent: null,
      optimisticDraft: null,
      questionDraft: content,
      requiresUserMatch
    });
    let responded = false;
    await sendStreamRequest({
      url: `/api/projects/${project.id}/edit-stream`,
      body: withLeaseSessionId(
        {
          content,
          branchName: targetBranch,
          fromRef,
          llmProvider: provider,
          llmModel: model,
          thinking: thinkingSetting,
          nodeId,
          clientRequestId
        },
        leaseSessionId
      ),
      onResponse: () => {
        responded = true;
        onResponse?.();
      },
      debugLabel: 'edit-stream'
    });
    if (!responded) {
      onFailure?.();
    }
  };



  const finalAssistantPresent = useMemo(() => {
    const requestId =
      streamMeta?.clientRequestId ??
      (optimisticUserNode?.type === 'message' ? optimisticUserNode.clientRequestId ?? null : null);
    if (!requestId) return false;
    const targetBranch = streamMeta?.branch ?? branchName;
    if (branchName !== targetBranch) return false;
    return nodes.some((node) => {
      if (node.type !== 'message' || node.role !== 'assistant') return false;
      const nodeBranch = node.createdOnBranch ?? branchName;
      if (nodeBranch !== targetBranch) return false;
      return node.clientRequestId === requestId;
    });
  }, [nodes, streamMeta, branchName, optimisticUserNode]);

  const streamingPayload =
    streamPreview.length > 0 || streamBlocks.length > 0
      ? { preview: streamPreview, blocks: streamBlocks }
      : streamCache;
  const streamingPayloadSource =
    streamPreview.length > 0 || streamBlocks.length > 0 ? 'live' : streamCache ? 'cache' : 'none';
  const hasStreamingPayload = Boolean(streamingPayload);
  const branchActionDisabled =
    state.isStreaming || assistantLifecycle === 'pending' || assistantLifecycle === 'streaming';
  const isSending = state.isStreaming || assistantLifecycle === 'pending' || assistantLifecycle === 'streaming';

  const toggleComposerCollapsed = useCallback(
    (next?: boolean) => {
      setComposerCollapsed((prev) => {
        const target = typeof next === 'boolean' ? next : !prev;
        if (state.isStreaming || target === prev) return prev;
        return target;
      });
    },
    [state.isStreaming]
  );

  const expandComposer = useCallback(() => toggleComposerCollapsed(false), [toggleComposerCollapsed]);
  const handleQuoteReply = useCallback(
    (nodeId: string, messageText: string, selectionText?: string) => {
      const scopedSelection = getSelectionForNode(nodeId);
      const trimmedSelection = scopedSelection || selectionText?.trim() || '';
      const sourceText = trimmedSelection || messageText;
      if (composerCollapsed) {
        expandComposer();
        window.setTimeout(() => composerHandleRef.current?.appendQuotedText(sourceText), 0);
      } else {
        composerHandleRef.current?.appendQuotedText(sourceText);
      }
      if (typeof window !== 'undefined') {
        window.getSelection()?.removeAllRanges();
      }
    },
    [composerCollapsed, expandComposer, getSelectionForNode]
  );
  const toggleAllWorkspacePanels = useCallback(() => {
    const railState = railStateRef.current;
    if (!railState) return;
    const isAllCollapsed = railState.railCollapsed && insightCollapsed && composerCollapsed;
    if (collapseSnapshotRef.current && isAllCollapsed) {
      const snapshot = collapseSnapshotRef.current;
      collapseSnapshotRef.current = null;
      if (snapshot.railCollapsed !== railState.railCollapsed) {
        railState.toggleRail();
      }
      if (snapshot.insightCollapsed) {
        if (!insightCollapsed) {
          collapseInsights();
        }
      } else if (insightCollapsed) {
        expandInsights();
      }
      toggleComposerCollapsed(snapshot.composerCollapsed);
      return;
    }

    collapseSnapshotRef.current = {
      railCollapsed: railState.railCollapsed,
      insightCollapsed,
      composerCollapsed
    };

    if (!railState.railCollapsed) {
      railState.toggleRail();
    }
    if (!insightCollapsed) {
      collapseInsights();
    }
    if (!composerCollapsed) {
      toggleComposerCollapsed(true);
    }
  }, [
    collapseInsights,
    composerCollapsed,
    expandInsights,
    insightCollapsed,
    toggleComposerCollapsed
  ]);

  useEffect(() => {
    if (!state.error || (!optimisticDraftRef.current && !questionDraftRef.current)) return;
    const sent = optimisticDraftRef.current;
    optimisticDraftRef.current = null;
    questionDraftRef.current = null;
    void Promise.all([refreshHistory(), mutateArtefact()]).catch(() => {});
    setOptimisticUserNode(null);
    setStreamPreview('');
    setStreamBlocks([]);
    setStreamCache(null);
    setStreamMeta(null);
    turnUserRenderIdRef.current = null;
    turnAssistantRenderIdRef.current = null;
    if (!hasReceivedAssistantChunkRef.current) {
      if (sent) {
        composerHandleRef.current?.setDraftAndFocus(sent);
      }
    }
    hasReceivedAssistantChunkRef.current = false;
    if (assistantPendingTimerRef.current) {
      clearTimeout(assistantPendingTimerRef.current);
      assistantPendingTimerRef.current = null;
    }
    setAssistantLifecycle('error');
  }, [state.error, mutateArtefact, refreshHistory]);

  useEffect(() => {
    if (!finalAssistantPresent) return;
    setAssistantLifecycle('final');
    if (optimisticUserNode && DEBUG_ASSISTANT_LIFECYCLE) {
      console.debug('[assistant-lifecycle] reconcile-optimistic', {
        branch: branchName,
        optimisticUserId: optimisticUserNode.id
      });
    }
    setStreamMeta(null);
    setStreamPreview('');
    streamPreviewRef.current = '';
    setStreamBlocks([]);
    streamBlocksRef.current = [];
    setStreamCache(null);
    streamBranchRef.current = null;
    if (DEBUG_ASSISTANT_LIFECYCLE) {
      console.debug('[assistant-lifecycle] final-assistant-present', {
        branch: branchName,
        streamMeta: streamMeta ?? null,
        nodes: nodes.length
      });
    }
  }, [finalAssistantPresent, optimisticUserNode, branchName, nodes.length, streamMeta]);
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
    if (newBranchName.trim()) return;
    setNewBranchProvider(normalizeProviderForUi(branchProvider));
    setNewBranchThinking(thinking);
  }, [branchProvider, thinking, newBranchName]);

  useEffect(() => {
    setArtefactDraft(artefact);
  }, [artefact]);

  const trunkName = useMemo(() => branches.find((b) => b.isTrunk)?.name ?? 'main', [branches]);
  const displayBranchName = (name: string) => (name === trunkName ? TRUNK_LABEL : name);
  const toastToneClassName = (tone: ToastTone) => {
    if (tone === 'success') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    }
    if (tone === 'error') {
      return 'border-red-200 bg-red-50 text-red-700';
    }
    return 'border-slate-200 bg-white text-slate-800';
  };
  const pendingBranchNames = useMemo(
    () => new Set(backgroundTasks.map((task) => task.branchName)),
    [backgroundTasks]
  );
  const displayBranches = useMemo<BranchListItem[]>(() => {
    const ghostBranches = backgroundTasks
      .filter((task) => !branches.some((branch) => branch.name === task.branchName))
      .map((task) => ({
        name: task.branchName,
        headCommit: '',
        nodeCount: 0,
        isTrunk: false,
        isPinned: false,
      isGhost: true
    }));
    return [...branches, ...ghostBranches];
  }, [branches, backgroundTasks]);
  const sortedBranches = useMemo(() => {
    const pinned = displayBranches.filter((branch) => branch.isPinned && !branch.isHidden);
    const pendingGhosts = displayBranches.filter((branch) => branch.isGhost);
    const visible = displayBranches.filter((branch) => !branch.isPinned && !branch.isGhost && !branch.isHidden);
    const hidden = displayBranches.filter((branch) => branch.isHidden);
    return [...pinned, ...pendingGhosts, ...visible, ...hidden];
  }, [displayBranches]);
  const branchColorMap = useMemo(
    () =>
      buildBranchColorMap(
        sortedBranches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          isTrunk: branch.isTrunk
        })),
        trunkName
      ),
    [sortedBranches, trunkName]
  );
  const graphRequestKey = useMemo(() => sortedBranches.map((b) => b.name).sort().join('|'), [sortedBranches]);
  const lastGraphRequestKeyRef = useRef<string | null>(null);
  const buildGraphViewsFromHistories = useCallback(
    (histories: Record<string, NodeRecord[]>, activeBranchOverride?: string) => {
      const graph = buildGraphPayload({
        branchHistories: histories,
        trunkName,
        activeBranchName: activeBranchOverride ?? branchName
      });
      return { all: graph.all, collapsed: graph.collapsed };
    },
    [branchName, trunkName]
  );
  const loadGraphHistories = useCallback(
    async ({ force = false, signal }: { force?: boolean; signal?: AbortSignal } = {}) => {
      if (!force && (insightCollapsed || insightTab !== 'graph')) {
        return;
      }
      setGraphHistoryLoading(true);
      setGraphHistoryError(null);
      try {
        const res = await fetch(`/api/projects/${project.id}/graph`, { signal });
        if (!res.ok) {
          throw new Error('Failed to load graph');
        }
        const data = (await res.json()) as {
          branchHistories?: Record<string, NodeRecord[]>;
          graph?: GraphViews;
        };
        const nextHistories = data.branchHistories ?? {};
        setGraphHistories(nextHistories);
        setGraphViews(data.graph ?? buildGraphViewsFromHistories(nextHistories));
        lastGraphRequestKeyRef.current = graphRequestKey;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setGraphHistoryError((err as Error).message);
      } finally {
        setGraphHistoryLoading(false);
      }
    },
    [graphRequestKey, insightCollapsed, insightTab, project.id, buildGraphViewsFromHistories]
  );
  const reloadBranches = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/branches`);
      if (!res.ok) {
        throw new Error('Failed to reload branches');
      }
      const data = (await res.json()) as { branches?: BranchSummary[] };
      if (Array.isArray(data.branches)) {
        setBranches(data.branches);
      }
    } catch (err) {
      console.error('[workspace] reload branches failed', err);
    }
  }, [project.id]);
  const refreshInsights = useCallback(
    (options?: { includeGraph?: boolean; includeBranches?: boolean }) => {
      const tasks: Promise<unknown>[] = [];
      if (options?.includeBranches) {
        tasks.push(reloadBranches());
      }
      if (options?.includeGraph) {
        tasks.push(loadGraphHistories({ force: true }));
      }
      if (tasks.length === 0) return;
      void Promise.allSettled(tasks);
    },
    [loadGraphHistories, reloadBranches]
  );

  useEffect(() => {
    if (historyEpoch === 0) return;
    refreshInsights({ includeGraph: true, includeBranches: true });
  }, [historyEpoch, refreshInsights]);

  useEffect(() => {
    if (composerCollapsed) {
      setComposerPadding(COLLAPSED_COMPOSER_PADDING);
      return;
    }
    setComposerPadding(composerExpandedPaddingRef.current);
  }, [COLLAPSED_COMPOSER_PADDING, composerCollapsed]);

  useEffect(() => {
    if (insightCollapsed || insightTab !== 'graph') return;
    if (graphHistories && lastGraphRequestKeyRef.current === graphRequestKey && !graphHistoryError) {
      return;
    }
    const controller = new AbortController();
    void loadGraphHistories({ signal: controller.signal });
    return () => controller.abort();
  }, [insightCollapsed, insightTab, graphRequestKey, graphHistories, graphHistoryError, loadGraphHistories]);

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
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        if (insightCollapsed) {
          expandInsights();
        } else {
          collapseInsights();
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
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || !event.shiftKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      if (state.isStreaming) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      toggleAllWorkspacePanels();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.isStreaming, toggleAllWorkspacePanels]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.shiftKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      if (state.isStreaming) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      toggleComposerCollapsed();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.isStreaming, toggleComposerCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.isStreaming) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if (event.key.length !== 1 || event.key === ' ') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (composerCollapsed) {
        expandComposer();
        window.setTimeout(() => composerHandleRef.current?.appendTextAndFocus(event.key), 0);
        return;
      }
      composerHandleRef.current?.appendTextAndFocus(event.key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [composerCollapsed, expandComposer, state.isStreaming]);

  useEffect(() => {
    return () => {
      if (graphCopyFeedbackTimeoutRef.current) {
        clearTimeout(graphCopyFeedbackTimeoutRef.current);
        graphCopyFeedbackTimeoutRef.current = null;
      }
      if (jumpHighlightTimeoutRef.current) {
        clearTimeout(jumpHighlightTimeoutRef.current);
        jumpHighlightTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (artefactDraft === artefact) return;

    const snapshotContent = artefactDraft;
    const snapshotRef = branchName;
    scheduleAutosave({ content: snapshotContent, ref: snapshotRef });

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
  }, [artefactDraft, artefact, branchName, trunkName, scheduleAutosave]);

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
    if (!showBranchSettings) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (branchSettingsButtonRef.current?.contains(target)) return;
      if (branchSettingsPopoverRef.current?.contains(target)) return;
      setShowBranchSettings(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBranchSettings(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showBranchSettings]);

  useEffect(() => {
    if (showShareModal) {
      setShowBranchSettings(false);
    }
  }, [showShareModal]);

  useEffect(() => {
    if (!openBranchMenu) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-branch-menu]')) return;
      setOpenBranchMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenBranchMenu(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openBranchMenu]);

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
  const [showNewBranchModal, setShowNewBranchModal] = useState(false);
  const newBranchModalRef = useRef<HTMLDivElement | null>(null);
  const [jumpHighlightNodeId, setJumpHighlightNodeId] = useState<string | null>(null);
  const jumpHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJumpRef = useRef<{ nodeId: string; targetBranch: string; revealShared: boolean; attempts: number } | null>(
    null
  );
  const [jumpRequestId, setJumpRequestId] = useState(0);

  useEffect(() => {
    if (isLoading || !hasEverSentMessageHydrated || !isNewUser || autoOpenedHintsRef.current) return;
    setShowHints(true);
    autoOpenedHintsRef.current = true;
  }, [isLoading, isNewUser, hasEverSentMessageHydrated]);

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
    if (!showNewBranchModal) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowNewBranchModal(false);
        resetBranchQuestionState();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showNewBranchModal, resetBranchQuestionState]);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageLineHeightSampleRef = useRef<HTMLSpanElement | null>(null);
  const providerPillRef = useRef<HTMLDivElement | null>(null);
  const initialScrollKeyRef = useRef<string | null>(null);
  const lastPinKeyRef = useRef<string | null>(null);
  const pinnedScrollTopRef = useRef<number | null>(null);
  const pinnedNodeIdRef = useRef<string | null>(null);
  const pinnedOffsetRef = useRef<number | null>(null);
  const suppressPinScrollRef = useRef(false);
  const pinHoldActiveRef = useRef(false);
  const userScrollIntentRef = useRef(false);
  const [messageLineHeight, setMessageLineHeight] = useState<number | null>(null);
  const [pillBottomOffset, setPillBottomOffset] = useState<number | null>(null);
  const [listPaddingExtra, setListPaddingExtra] = useState(0);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [activeBranchHighlight, setActiveBranchHighlight] = useState<{
    nodeId: string;
    text: string;
    point?: { x: number; y: number };
  } | null>(null);
  const [chatListWidth, setChatListWidth] = useState<number | null>(null);

  const minMessageListPadding = useMemo(() => {
    if (!Number.isFinite(messageLineHeight ?? NaN) || (messageLineHeight ?? 0) <= 0) {
      return MESSAGE_LIST_BASE_PADDING;
    }
    return Math.ceil((messageLineHeight ?? 0) * 4);
  }, [messageLineHeight]);

  const messageListPaddingBottom = minMessageListPadding + listPaddingExtra;
  const highlightMenuOffset = messageLineHeight ?? 16;
  if (DEBUG_MESSAGE_SCROLL) {
    console.debug('[message-scroll] padding', {
      minMessageListPadding,
      listPaddingExtra,
      messageListPaddingBottom
    });
  }

  const updateMessageLineHeight = useCallback(() => {
    if (typeof window === 'undefined') return;
    const sample = messageLineHeightSampleRef.current;
    if (!sample) return;
    const styles = window.getComputedStyle(sample);
    const lineHeight = Number.parseFloat(styles.lineHeight || '');
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
    setMessageLineHeight(lineHeight);
  }, []);

  const updatePillOffset = useCallback(() => {
    if (typeof window === 'undefined') return;
    const container = messageListRef.current;
    const pill = providerPillRef.current;
    if (!container || !pill) return;
    const containerRect = container.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const offset = Math.max(0, pillRect.bottom - containerRect.top);
    setPillBottomOffset(offset);
  }, []);

  const updateChatListWidth = useCallback(() => {
    if (typeof window === 'undefined') return;
    const container = messageListRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return;
    setChatListWidth(rect.width);
  }, []);

  useLayoutEffect(() => {
    updateMessageLineHeight();
  }, [updateMessageLineHeight]);

  useLayoutEffect(() => {
    updatePillOffset();
  }, [updatePillOffset]);

  useLayoutEffect(() => {
    updateChatListWidth();
  }, [updateChatListWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sample = messageLineHeightSampleRef.current;
    const pill = providerPillRef.current;
    if (!sample && !pill) return;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            updateMessageLineHeight();
            updatePillOffset();
            updateChatListWidth();
          })
        : null;
    if (sample) {
      resizeObserver?.observe(sample);
    }
    if (pill) {
      resizeObserver?.observe(pill);
    }
    window.addEventListener('resize', updatePillOffset);
    window.addEventListener('resize', updateChatListWidth);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updatePillOffset);
      window.removeEventListener('resize', updateChatListWidth);
    };
  }, [updateMessageLineHeight, updatePillOffset, updateChatListWidth]);

  const { combinedNodes } = useMemo(() => {
    const optimisticMessage = optimisticUserNode?.type === 'message' ? optimisticUserNode : null;
    const optimisticBranch = optimisticMessage?.createdOnBranch ?? null;
    const allowOptimistic = optimisticBranch == null || optimisticBranch === branchName;
    const renderIdByNodeId = renderIdByNodeIdRef.current;
    const usedRenderIds = new Set<string>();

    if (turnUserRenderIdRef.current && turnUserRenderIdRef.current === turnAssistantRenderIdRef.current) {
      turnAssistantRenderIdRef.current = createClientId();
    }

    let persistedUserMatch: MessageNode | null = null;
    const optimisticRequestId = optimisticMessage?.clientRequestId ?? null;
    if (allowOptimistic && optimisticRequestId) {
      const reversedIndex = [...nodes].reverse().findIndex((node) => {
        if (node.type !== 'message') return false;
        if (node.role !== 'user') return false;
        if (node.clientRequestId !== optimisticRequestId) return false;
        const createdOn = node.createdOnBranch ?? branchName;
        return createdOn === (optimisticBranch ?? branchName);
      });
      if (reversedIndex >= 0) {
        const index = nodes.length - 1 - reversedIndex;
        const persisted = nodes[index] ?? null;
        if (persisted && persisted.type === 'message' && persisted.role === 'user') {
          persistedUserMatch = persisted;
          if (turnUserRenderIdRef.current) {
            renderIdByNodeId.set(persisted.id, turnUserRenderIdRef.current);
          }
        }
      }
    }

    let persistedAssistantMatch: MessageNode | null = null;
    if (streamMeta && streamMeta.branch === branchName && optimisticRequestId) {
      const reversedIndex = [...nodes].reverse().findIndex((node) => {
        if (node.type !== 'message' || node.role !== 'assistant') return false;
        if (node.clientRequestId !== optimisticRequestId) return false;
        const nodeBranch = node.createdOnBranch ?? branchName;
        return nodeBranch === streamMeta.branch;
      });
      if (reversedIndex >= 0) {
        const index = nodes.length - 1 - reversedIndex;
        const persisted = nodes[index] ?? null;
        if (persisted && persisted.type === 'message' && persisted.role === 'assistant') {
          persistedAssistantMatch = persisted;
          if (turnAssistantRenderIdRef.current) {
            renderIdByNodeId.set(persisted.id, turnAssistantRenderIdRef.current);
          }
        }
      }
    }

    const baseNodes: RenderNode[] = nodes.map((node) => {
      const mapped = renderIdByNodeId.get(node.id) ?? node.id;
      const renderId = usedRenderIds.has(mapped) ? node.id : mapped;
      usedRenderIds.add(renderId);
      return { ...node, renderId };
    });

    const out: RenderNode[] = [...baseNodes];
    const shouldRenderOptimisticUser =
      allowOptimistic &&
      optimisticUserNode &&
      !persistedUserMatch &&
      (streamMeta?.requiresUserMatch ?? true);
    if (shouldRenderOptimisticUser) {
      let renderId = turnUserRenderIdRef.current ?? optimisticUserNode.id;
      if (usedRenderIds.has(renderId)) {
        renderId = createClientId();
        turnUserRenderIdRef.current = renderId;
      }
      usedRenderIds.add(renderId);
      out.push({
        ...(optimisticUserNode as RenderNode),
        renderId,
        clientState: 'turn-user'
      });
    }

    const shouldRenderAssistantTurn =
      streamMeta?.branch === branchName &&
      (!persistedAssistantMatch || (streamMeta?.requiresUserMatch && !persistedUserMatch)) &&
      (assistantLifecycle === 'pending' ||
        assistantLifecycle === 'streaming' ||
        assistantLifecycle === 'final' ||
        hasStreamingPayload);
    if (shouldRenderAssistantTurn) {
      const isPending = assistantLifecycle === 'pending' && !hasStreamingPayload;
      let renderId = turnAssistantRenderIdRef.current ?? 'optimistic-assistant';
      if (usedRenderIds.has(renderId)) {
        renderId = createClientId();
        turnAssistantRenderIdRef.current = renderId;
      }
      usedRenderIds.add(renderId);
      out.push({
        id: 'optimistic-assistant',
        type: 'message',
        role: 'assistant',
        content: streamingPayload?.preview ?? '',
        contentBlocks: streamingPayload?.blocks ?? [],
        timestamp: Date.now(),
        parent: persistedUserMatch?.id ?? optimisticUserNode?.id ?? null,
        createdOnBranch: optimisticUserNode?.createdOnBranch ?? branchName,
        interrupted: state.error !== null,
        renderId,
        clientState: isPending ? 'turn-assistant-pending' : 'turn-assistant'
      });
    }

    return { combinedNodes: out };
  }, [
    nodes,
    optimisticUserNode,
    assistantLifecycle,
    hasStreamingPayload,
    streamMeta,
    streamingPayload,
    branchName,
    state.error
  ]);
  const visibleNodes = useMemo(() => combinedNodes.filter((node) => node.type !== 'state'), [combinedNodes]);
  const latestVisibleNodeId = useMemo(() => {
    if (visibleNodes.length === 0) return null;
    return visibleNodes[visibleNodes.length - 1]!.id;
  }, [visibleNodes]);

  useEffect(() => {
    if (visibleNodes.length === 0) return;
    const renderIdByNodeId = renderIdByNodeIdRef.current;
    if (renderIdByNodeId.size === 0) return;
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    for (const nodeId of renderIdByNodeId.keys()) {
      if (!visibleNodeIds.has(nodeId)) {
        renderIdByNodeId.delete(nodeId);
      }
    }
  }, [visibleNodes]);
  const latestPersistedVisibleNodeId = useMemo(() => {
    if (visibleNodes.length === 0) return null;
    for (let index = visibleNodes.length - 1; index >= 0; index -= 1) {
      const node = visibleNodes[index]!;
      if (!node.clientState) {
        return node.id;
      }
    }
    return null;
  }, [visibleNodes]);
  const visibleNodeRoleMap = useMemo(() => {
    return new Map(
      visibleNodes
        .filter((node) => node.type === 'message')
        .map((node) => [node.id, (node as MessageNode).role] as const)
    );
  }, [visibleNodes]);
  const updateScrollState = useCallback(() => {
    const container = messageListRef.current;
    if (!container) return;
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    const threshold = (messageLineHeight ?? 18) * 2;
    setIsNearBottom(distance <= threshold);
    setHasOverflow(container.scrollHeight > container.clientHeight + 1);
    if (DEBUG_MESSAGE_SCROLL) {
      console.debug('[message-scroll] state', {
        distance,
        threshold,
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
        hasOverflow: container.scrollHeight > container.clientHeight + 1
      });
    }
  }, [messageLineHeight]);

  const scrollToBottom = useCallback(() => {
    const container = messageListRef.current;
    if (!container) return;
    pinnedScrollTopRef.current = null;
    pinnedNodeIdRef.current = null;
    pinnedOffsetRef.current = null;
    lastPinKeyRef.current = null;
    pinHoldActiveRef.current = false;
    container.scrollTop = container.scrollHeight;
  }, []);

  const attemptJumpToNode = useCallback(
    (nodeId: string) => {
      const container = messageListRef.current;
      if (!container) return false;
      const el = container.querySelector(`[data-node-id="${nodeId}"]`);
      if (!(el instanceof HTMLElement)) return false;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const baseOffset = (pillBottomOffset ?? 0) + (messageLineHeight ?? 0) * 0.5;
      const desiredScrollTop = Math.max(0, container.scrollTop + (elRect.top - containerRect.top) - baseOffset);
      container.scrollTop = desiredScrollTop;
      pinHoldActiveRef.current = false;
      pinnedScrollTopRef.current = null;
      pinnedNodeIdRef.current = null;
      pinnedOffsetRef.current = null;
      lastPinKeyRef.current = null;
      suppressPinScrollRef.current = true;
      updateScrollState();
      return true;
    },
    [messageLineHeight, pillBottomOffset, updateScrollState]
  );

  useEffect(() => {
    if (!isGraphVisible) return;
    setGraphHistories((prev) => {
      if (!prev) return prev;
      const MAX_PER_BRANCH = 500;
      const nextNodes =
        nodes.length <= MAX_PER_BRANCH ? nodes : [nodes[0]!, ...nodes.slice(-(MAX_PER_BRANCH - 1))];
      const current = prev[branchName];
      // Avoid wiping the cached graph when history briefly revalidates to an empty snapshot.
      if (nextNodes.length === 0 && current?.length) {
        return prev;
      }
      if (current === nextNodes) return prev;
      if (current && nextNodes.length === 0) {
        // Keep the last known graph when the incoming snapshot is temporarily empty (e.g. during history refetch).
        return prev;
      }
      const currentTailId = current?.[current.length - 1]?.id ?? null;
      const nextTailId = nextNodes[nextNodes.length - 1]?.id ?? null;
      // Avoid thrashing the graph when the active history hasn't changed meaningfully.
      if (current && current.length === nextNodes.length && currentTailId === nextTailId) {
        return prev;
      }
      const nextHistories = { ...prev, [branchName]: nextNodes };
      setGraphViews(buildGraphViewsFromHistories(nextHistories));
      return nextHistories;
    });
  }, [isGraphVisible, branchName, nodes, buildGraphViewsFromHistories]);
  useEffect(() => {
    if (!isGraphVisible) return;
    if (!graphHistories) return;
    setGraphViews(buildGraphViewsFromHistories(graphHistories, branchName));
  }, [isGraphVisible, graphHistories, branchName, buildGraphViewsFromHistories]);

  const resolveGraphNode = useCallback(
    (nodeId: string) => {
      const activeMatch = visibleNodes.find((node) => node.id === nodeId) ?? null;
      let record: NodeRecord | null = activeMatch;
      let targetBranch: string = branchName;

      if (!record && graphHistories) {
        for (const [b, hist] of Object.entries(graphHistories)) {
          const found = hist.find((node) => node.id === nodeId);
          if (found) {
            record = found;
            targetBranch = b;
            break;
          }
        }
      }

      if (!record) return null;
      return { record, targetBranch };
    },
    [visibleNodes, graphHistories, branchName]
  );
  const persistedNodes = useMemo(() => nodes.filter((node) => node.type !== 'state'), [nodes]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const updateHighlightSelection = (pointOverride?: { x: number; y: number }) => {
      const selection = getSelectionContext();
      if (!selection) {
        setActiveBranchHighlight((prev) => (prev ? null : prev));
        return;
      }
      if (visibleNodeRoleMap.get(selection.nodeId) !== 'assistant') {
        setActiveBranchHighlight((prev) => (prev ? null : prev));
        return;
      }
      setActiveBranchHighlight((prev) => {
        if (prev?.nodeId === selection.nodeId && prev.text === selection.text) {
          return pointOverride ? { ...prev, point: pointOverride } : prev;
        }
        return { ...selection, point: pointOverride };
      });
    };

    const handleSelectionChange = () => updateHighlightSelection();
    const handleMouseUp = (event: MouseEvent) => {
      updateHighlightSelection({ x: event.clientX, y: event.clientY });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleSelectionChange);
    };
  }, [getSelectionContext, visibleNodeRoleMap]);

  useEffect(() => {
    if (isLoading) return;
    requestAnimationFrame(() => {
      updateScrollState();
    });
  }, [visibleNodes.length, streamPreview.length, streamBlocks.length, listPaddingExtra, messageLineHeight, isLoading, updateScrollState]);

  const handleMessageListScroll = () => {
    if (suppressPinScrollRef.current) {
      suppressPinScrollRef.current = false;
      updateScrollState();
      return;
    }
    if (userScrollIntentRef.current) {
      userScrollIntentRef.current = false;
      pinHoldActiveRef.current = false;
      pinnedScrollTopRef.current = null;
      pinnedNodeIdRef.current = null;
      pinnedOffsetRef.current = null;
      updateScrollState();
      return;
    }
    if (pinHoldActiveRef.current) {
      updateScrollState();
      return;
    }
    pinnedScrollTopRef.current = null;
    pinnedNodeIdRef.current = null;
    pinnedOffsetRef.current = null;
    updateScrollState();
  };
  const handleUserScrollIntent = () => {
    userScrollIntentRef.current = true;
  };

  useEffect(() => {
    if (isLoading) return;
    if (optimisticUserNode) return;
    if (initialScrollKeyRef.current === branchName) return;
    initialScrollKeyRef.current = branchName;
    requestAnimationFrame(() => {
      scrollToBottom();
      updateScrollState();
      if (DEBUG_MESSAGE_SCROLL) {
        console.debug('[message-scroll] initial-scroll', { branchName });
      }
    });
  }, [branchName, isLoading, optimisticUserNode, scrollToBottom, updateScrollState]);

  useEffect(() => {
    if (!optimisticUserNode) return;
    if (messageLineHeight == null || pillBottomOffset == null) {
      if (DEBUG_MESSAGE_SCROLL) {
        console.debug('[message-scroll] pin-skip', {
          reason: 'missing-metrics',
          messageLineHeight,
          pillBottomOffset
        });
      }
      return;
    }
    const pinTargetRenderId = turnUserRenderIdRef.current ?? optimisticUserNode.id;
    const pinKey = `${pinTargetRenderId}:${optimisticUserNode.id}`;
    if (lastPinKeyRef.current === pinKey) return;
    const container = messageListRef.current;
    if (!container) return;
    lastPinKeyRef.current = pinKey;
    requestAnimationFrame(() => {
      const el = container.querySelector(`[data-render-id="${pinTargetRenderId}"]`);
      if (!(el instanceof HTMLElement)) {
        if (DEBUG_MESSAGE_SCROLL) {
          console.debug('[message-scroll] pin-skip', { reason: 'node-missing', nodeId: pinTargetRenderId });
        }
        lastPinKeyRef.current = null;
        return;
      }
      const pinOffset = pillBottomOffset + messageLineHeight * 0.5;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const desiredScrollTop = Math.max(0, container.scrollTop + (elRect.top - containerRect.top) - pinOffset);
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const extraPadding = Math.max(0, desiredScrollTop - maxScrollTop);
      if (extraPadding > 0) {
        setListPaddingExtra((prev) => Math.max(prev, extraPadding));
      }
      if (DEBUG_MESSAGE_SCROLL) {
        console.debug('[message-scroll] pin-submit', {
          pinOffset,
          desiredScrollTop,
          maxScrollTop,
          extraPadding,
          pillBottomOffset,
          lineHeight: messageLineHeight,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight
        });
      }
      requestAnimationFrame(() => {
        container.scrollTop = desiredScrollTop;
        suppressPinScrollRef.current = true;
        pinnedScrollTopRef.current = desiredScrollTop;
        pinnedNodeIdRef.current = pinTargetRenderId;
        pinnedOffsetRef.current = pinOffset;
        pinHoldActiveRef.current = true;
        updateScrollState();
      });
    });
  }, [optimisticUserNode, messageLineHeight, pillBottomOffset, updateScrollState]);

  useEffect(() => {
    setOptimisticUserNode(null);
    lastPinKeyRef.current = null;
    setListPaddingExtra(0);
    pinnedScrollTopRef.current = null;
    pinnedNodeIdRef.current = null;
    pinnedOffsetRef.current = null;
    suppressPinScrollRef.current = false;
    pinHoldActiveRef.current = false;
    userScrollIntentRef.current = false;
    turnUserRenderIdRef.current = null;
    turnAssistantRenderIdRef.current = null;
    renderIdByNodeIdRef.current.clear();
  }, [branchName]);

  useLayoutEffect(() => {
    const container = messageListRef.current;
    if (!container || !pinHoldActiveRef.current) return;
    const pinnedNodeId = pinnedNodeIdRef.current;
    const pinOffset = pinnedOffsetRef.current;
    if (pinnedNodeId && pinOffset != null) {
      const el = container.querySelector(`[data-render-id="${pinnedNodeId}"]`);
      if (el instanceof HTMLElement) {
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const desiredScrollTop = Math.max(0, container.scrollTop + (elRect.top - containerRect.top) - pinOffset);
        if (Math.abs(container.scrollTop - desiredScrollTop) >= 1) {
          container.scrollTop = desiredScrollTop;
          suppressPinScrollRef.current = true;
          pinnedScrollTopRef.current = desiredScrollTop;
          updateScrollState();
          if (DEBUG_MESSAGE_SCROLL) {
            console.debug('[message-scroll] pin-lock', { pinnedScrollTop: desiredScrollTop });
          }
        }
        return;
      }
    }
    const pinned = pinnedScrollTopRef.current;
    if (pinned == null) return;
    if (Math.abs(container.scrollTop - pinned) < 1) return;
    container.scrollTop = pinned;
    suppressPinScrollRef.current = true;
    updateScrollState();
    if (DEBUG_MESSAGE_SCROLL) {
      console.debug('[message-scroll] pin-lock', { pinnedScrollTop: pinned });
    }
  }, [
    assistantLifecycle,
    visibleNodes.length,
    streamPreview.length,
    streamBlocks.length,
    messageLineHeight,
    pillBottomOffset,
    updateScrollState
  ]);

  useEffect(() => {
    if (!showNewBranchModal || !latestPersistedVisibleNodeId) return;
    setBranchSplitNodeId((prev) => prev ?? latestPersistedVisibleNodeId);
  }, [showNewBranchModal, latestPersistedVisibleNodeId]);

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
  const trunkHistoryNodes = useMemo(
    () => trunkHistory?.nodes?.filter((node) => node.type !== 'state') ?? null,
    [trunkHistory]
  );
  const trunkNodeCount = useMemo(() => branches.find((b) => b.isTrunk)?.nodeCount ?? 0, [branches]);
  const sharedCount = useMemo(() => {
    if (branchName === trunkName) {
      return 0;
    }
    const splitIndex = persistedNodes.findIndex((node) => node.createdOnBranch === branchName);
    if (splitIndex !== -1) {
      return splitIndex;
    }
    if (trunkHistoryNodes && trunkHistoryNodes.length > 0) {
      const min = Math.min(trunkHistoryNodes.length, persistedNodes.length);
      let idx = 0;
      while (idx < min && trunkHistoryNodes[idx]?.id === persistedNodes[idx]?.id) {
        idx += 1;
      }
      return idx;
    }
    const fallbackCount = Math.min(trunkNodeCount, persistedNodes.length);
    if (fallbackCount > 0) {
      return fallbackCount;
    }
    const trunkHistory = graphHistories?.[trunkName] ?? null;
    const branchHistory = graphHistories?.[branchName] ?? null;
    if (trunkHistory && branchHistory) {
      const trunkVisible = trunkHistory.filter((node) => node.type !== 'state');
      const branchVisible = branchHistory.filter((node) => node.type !== 'state');
      const min = Math.min(trunkVisible.length, branchVisible.length);
      let idx = 0;
      while (idx < min && trunkVisible[idx]?.id === branchVisible[idx]?.id) {
        idx += 1;
      }
      return idx;
    }
    return fallbackCount;
  }, [branchName, trunkName, persistedNodes, trunkHistoryNodes, trunkNodeCount, graphHistories]);
  const [hideShared, setHideShared] = useState(branchName !== trunkName);
  useEffect(() => {
    setHideShared(branchName !== trunkName);
  }, [branchName, trunkName]);
  useEffect(() => {
    const pending = pendingJumpRef.current;
    if (!pending) return;
    if (pending.targetBranch !== branchName) return;
    if (pending.revealShared && hideShared) {
      setHideShared(false);
      return;
    }
    const success = attemptJumpToNode(pending.nodeId);
    if (!success) {
      pending.attempts += 1;
      if (pending.attempts > 12) {
        pendingJumpRef.current = null;
      }
      return;
    }
    setJumpHighlightNodeId(pending.nodeId);
    if (jumpHighlightTimeoutRef.current) {
      clearTimeout(jumpHighlightTimeoutRef.current);
    }
    jumpHighlightTimeoutRef.current = setTimeout(() => {
      setJumpHighlightNodeId(null);
    }, 1400);
    pendingJumpRef.current = null;
  }, [attemptJumpToNode, branchName, hideShared, jumpRequestId, latestVisibleNodeId]);
  const { sharedNodes, branchNodes } = useMemo(() => {
    const shared = visibleNodes.slice(0, sharedCount);
    return {
      sharedNodes: shared,
      branchNodes: visibleNodes.slice(sharedCount)
    };
  }, [visibleNodes, sharedCount]);

  const getNodeRenderKey = useCallback((node: RenderNode) => node.renderId ?? node.id, []);

  const mergePayloadCandidates = useMemo(() => {
    return branchNodes.filter(
      (node) =>
        node.type === 'message' &&
        node.role === 'assistant' &&
        !node.clientState &&
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
    if (!streamHoldPending) return;
    if (streamHoldPending.branch !== branchName) return;
    const candidates = [...nodes]
      .reverse()
      .filter(
        (node) =>
          node.type === 'message' &&
          node.role === 'assistant' &&
          (node.createdOnBranch ? node.createdOnBranch === branchName : true)
      ) as MessageNode[];
    const target = candidates[0] ?? null;
    if (!target) return;
    setStreamHold({
      targetId: target.id,
      content: streamHoldPending.content,
      contentBlocks: streamHoldPending.contentBlocks,
      branch: branchName
    });
    setStreamHoldPending(null);
    setStreamPreview('');
    streamPreviewRef.current = '';
    setStreamBlocks([]);
    streamBlocksRef.current = [];
    setStreamCache(null);
  }, [streamHoldPending, branchName, nodes]);

  useEffect(() => {
    if (!streamHoldPending) return;
    if (streamHoldPending.branch === branchName) return;
    setStreamHoldPending(null);
    setStreamPreview('');
    streamPreviewRef.current = '';
    setStreamBlocks([]);
    streamBlocksRef.current = [];
    setStreamCache(null);
    streamBranchRef.current = null;
  }, [streamHoldPending, branchName]);

  useEffect(() => {
    if (!streamHold || streamHold.branch !== branchName) return;
    const target = nodes.find((node) => node.id === streamHold.targetId);
    if (!target || target.type !== 'message' || target.role !== 'assistant') return;
    const currentText = normalizeMessageText(getNodeText(target));
    const holdText = normalizeMessageText(streamHold.content);
    if (currentText && currentText === holdText) {
      setStreamHold(null);
    }
  }, [streamHold, branchName, nodes]);

  useEffect(() => {
    if (!DEBUG_ASSISTANT_LIFECYCLE) return;
    const latestNodeId = visibleNodes[visibleNodes.length - 1]?.id ?? null;
    console.debug('[assistant-lifecycle] snapshot', {
      branch: branchName,
      assistantLifecycle,
      finalAssistantPresent,
      optimisticUserId: optimisticUserNode?.id ?? null,
      streamMeta: streamMeta ?? null,
      streamingPayloadSource,
      streamPreviewLength: streamPreview.length,
      streamBlocksLength: streamBlocks.length,
      nodesCount: nodes.length,
      visibleCount: visibleNodes.length,
      latestNodeId
    });
  }, [
    branchName,
    assistantLifecycle,
    finalAssistantPresent,
    optimisticUserNode?.id,
    streamMeta,
    streamPreview.length,
    streamBlocks.length,
    nodes.length,
    visibleNodes.length
  ]);

  useEffect(() => {
    if (!streamHoldPending && streamBranchRef.current && streamBranchRef.current !== branchName && !state.isStreaming) {
      setStreamPreview('');
      streamPreviewRef.current = '';
      setStreamBlocks([]);
      streamBlocksRef.current = [];
      setStreamCache(null);
      streamBranchRef.current = null;
      setAssistantLifecycle('idle');
      setStreamMeta(null);
    }
  }, [branchName, streamHoldPending, state.isStreaming]);

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

  const taggedCanvasDiffMergeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of visibleNodes) {
      if (node.type === 'message' && node.pinnedFromMergeId) {
        ids.add(node.pinnedFromMergeId);
      }
    }
    return ids;
  }, [visibleNodes]);

  const tagCanvasDiffToContext = async (mergeNodeId: string, targetBranch: string) => {
    if (!ensureLeaseSessionReady()) {
      throw new Error('Editing session is still initializing.');
    }
    if (isPgMode) {
      const { lease } = getLeaseForBranchName(targetBranch);
      if (lease && lease.holderSessionId !== leaseSessionId) {
        throw new Error('Editing locked. Editor access required.');
      }
    }
    const res = await fetch(`/api/projects/${project.id}/merge/pin-canvas-diff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withLeaseSessionId({ mergeNodeId, targetBranch }, leaseSessionId))
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error?.message ?? 'Failed to add diff to context');
    }
    return (await res.json().catch(() => null)) as { pinnedNode?: NodeRecord; alreadyPinned?: boolean } | null;
  };

  const tagCanvasDiffToCurrentBranch = useCallback(async (mergeNodeId: string) => {
    await tagCanvasDiffToContext(mergeNodeId, branchName);
    await refreshHistory();
  }, [branchName, refreshHistory, tagCanvasDiffToContext]);

  const handleToggleStarForNode = useCallback((nodeId: string) => {
    void toggleStar(nodeId);
  }, [toggleStar]);

  const handleEditNode = useCallback((node: MessageNode, quoteSelectionText: string) => {
    openEditModalRef.current(node, quoteSelectionText);
  }, []);

  const switchBranch = async (name: string) => {
    if (name === branchName) return;
    setIsSwitching(true);
    setBranchActionError(null);
    try {
      clearPendingAutosave();
      const canSwitch = await ensureCanvasSavedForBranchSwitch();
      if (!canSwitch) {
        return;
      }
      const targetBranch = branches.find((branch) => branch.name === name);
      if (targetBranch?.isHidden) {
        const ok = await ensureBranchVisible(targetBranch);
        if (!ok) {
          return;
        }
      }
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
      if (isPgMode) {
        await mutateLeases();
      }
      await Promise.all([refreshHistory(), mutateArtefact()]);
    } catch (err) {
      setBranchActionError((err as Error).message);
    } finally {
      setIsSwitching(false);
    }
  };

  const jumpToGraphNode = useCallback(
    async (nodeId: string, options?: { mode?: 'nearest' | 'origin'; originBranchId?: string }) => {
      const resolved = resolveGraphNode(nodeId);
      if (!resolved) return;
      const mode = options?.mode ?? 'nearest';
      const originBranch = options?.originBranchId ?? resolved.record.createdOnBranch ?? resolved.targetBranch;
      let targetBranch = resolved.targetBranch;
      let revealShared = false;

      if (mode === 'origin') {
        targetBranch = originBranch;
      } else {
        // Nearest jumps are deterministic: stay on current branch when present; otherwise jump to origin branch.
        // We intentionally avoid "first branch that contains the node" to prevent confusing cross-branch jumps.
        const activeIndex = visibleNodes.findIndex((node) => node.id === resolved.record.id);
        if (activeIndex >= 0) {
          targetBranch = branchName;
          revealShared = activeIndex < sharedCount;
        } else if (resolved.targetBranch === branchName) {
          targetBranch = branchName;
          revealShared = true;
        } else {
          targetBranch = originBranch;
        }
      }

      if (targetBranch !== branchName) {
        pendingJumpRef.current = { nodeId: resolved.record.id, targetBranch, revealShared, attempts: 0 };
        setJumpRequestId((prev) => prev + 1);
        await switchBranch(targetBranch);
        return;
      }

      pendingJumpRef.current = { nodeId: resolved.record.id, targetBranch, revealShared, attempts: 0 };
      setJumpRequestId((prev) => prev + 1);
    },
    [resolveGraphNode, branchName, switchBranch, visibleNodes, sharedCount]
  );

  const startEditTask = useCallback(
    ({
      targetBranch,
      fromRef,
      content,
      provider,
      model,
      thinkingSetting,
      nodeId,
      switchOnComplete,
      onResponse,
      onFailure
    }: {
      targetBranch: string;
      fromRef: string;
      content: string;
      provider: LLMProvider;
      model: string;
      thinkingSetting: ThinkingSetting;
      nodeId?: string | null;
      switchOnComplete: boolean;
      onResponse?: () => void;
      onFailure?: () => void;
    }) => {
      if (!ensureLeaseSessionReady()) {
        onFailure?.();
        return;
      }
      if (isPgMode) {
        const { lease } = getLeaseForBranchName(targetBranch);
        if (lease && lease.holderSessionId !== leaseSessionId) {
          pushToast('error', 'Editing locked. Editor access required.');
          onFailure?.();
          return;
        }
      }
      const clientRequestId = createClientId();
      const taskId = startBackgroundTask({
        branchName: targetBranch,
        kind: 'edit',
        switchOnComplete
      });
      pushToast('info', `Edit queued for ${displayBranchName(targetBranch)}.`);
      void (async () => {
        let responded = false;
        try {
          const res = await fetch(`/api/projects/${project.id}/edit-stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              withLeaseSessionId(
                {
                  content,
                  branchName: targetBranch,
                  fromRef,
                  llmProvider: provider,
                  llmModel: model,
                  thinking: thinkingSetting,
                  nodeId,
                  clientRequestId
                },
                leaseSessionId
              )
            )
          });
          if (!res.ok || !res.body) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error?.message ?? 'Edit failed');
          }
          responded = true;
          onResponse?.();
          const reader = res.body.getReader();
          const { errorMessage } = await consumeNdjsonStream(reader, {
            defaultErrorMessage: 'Edit failed'
          });
          if (errorMessage) {
            throw new Error(errorMessage);
          }
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(`researchtree:thinking:${project.id}:${targetBranch}`, thinkingSetting);
          }
          await refreshInsights({ includeGraph: true, includeBranches: true });
          pushToast('success', `Edit completed on ${displayBranchName(targetBranch)}.`);
        } catch (err) {
          if (!responded) {
            onFailure?.();
          }
          pushToast('error', (err as Error).message);
        } finally {
          finishBackgroundTask(taskId);
        }
      })();
    },
    [
      displayBranchName,
      ensureLeaseSessionReady,
      finishBackgroundTask,
      getLeaseForBranchName,
      isPgMode,
      leaseSessionId,
      project.id,
      pushToast,
      refreshInsights,
      startBackgroundTask,
      switchBranch
    ]
  );

  const createBranch = async ({ switchToNew = true }: { switchToNew?: boolean } = {}) => {
    if (!newBranchName.trim()) {
      setBranchActionError('Branch name is required.');
      return { ok: false as const };
    }
    const canCreate = await ensureCanvasSavedForBranchSwitch();
    if (!canCreate) {
      return { ok: false as const };
    }
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
          ...(branchSplitNodeId ? { fromNodeId: branchSplitNodeId } : {}),
          provider: newBranchProvider,
          model: branchModel,
          switch: switchToNew
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to create branch');
      }
      const data = (await res.json()) as { branchName: string; branchId?: string | null; branches: BranchSummary[] };
      const createdBranchName = data.branchName ?? newBranchName.trim();
      const createdBranch = data.branches?.find((branch) => branch.name === createdBranchName);
      setBranches(data.branches);
      if (switchToNew && createdBranchName) {
        setBranchName(createdBranchName);
      }
      setNewBranchName('');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          `researchtree:thinking:${project.id}:${createdBranchName}`,
          newBranchThinking
        );
      }
      refreshCoreData();
      refreshInsights({ includeGraph: true, includeBranches: true });
      return {
        ok: true as const,
        branchName: createdBranchName,
        branchProvider: createdBranch?.provider,
        branchModel: createdBranch?.model
      };
    } catch (err) {
      setBranchActionError((err as Error).message);
      return { ok: false as const };
    } finally {
      setIsCreating(false);
    }
  };

  const startBranchQuestionTask = useCallback(
    ({
      targetBranch,
      fromRef,
      fromNodeId,
      question,
      highlight,
      provider,
      model,
      thinkingSetting,
      switchOnCreate,
      onResponse,
      onFailure
    }: {
      targetBranch: string;
      fromRef: string;
      fromNodeId?: string | null;
      question: string;
      highlight?: string;
      provider: LLMProvider;
      model: string;
      thinkingSetting: ThinkingSetting;
      switchOnCreate: boolean;
      onResponse?: () => void;
      onFailure?: () => void;
    }) => {
      if (!ensureLeaseSessionReady()) {
        onFailure?.();
        return;
      }
      const clientRequestId = createClientId();
      const taskId = startBackgroundTask({
        branchName: targetBranch,
        kind: 'question',
        switchOnComplete: false
      });
      pushToast('info', `Question queued for ${displayBranchName(targetBranch)}.`);
      void (async () => {
        let responded = false;
        try {
          const res = await fetch(`/api/projects/${project.id}/branch-question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              withLeaseSessionId(
                {
                  name: targetBranch,
                  fromRef,
                  fromNodeId,
                  provider,
                  model,
                  question,
                  highlight,
                  thinking: thinkingSetting,
                  switch: switchOnCreate,
                  clientRequestId
                },
                leaseSessionId
              )
            )
          });
          if (!res.ok || !res.body) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error?.message ?? 'Failed to send question to new branch');
          }
          responded = true;
          addQuestionBranchForNode(fromNodeId, targetBranch);
          onResponse?.();
          const reader = res.body.getReader();
          const { errorMessage } = await consumeNdjsonStream(reader, {
            defaultErrorMessage: 'Failed to send question to new branch'
          });
          if (errorMessage) {
            throw new Error(errorMessage);
          }
          pushToast('success', `Question completed on ${displayBranchName(targetBranch)}.`);
          await refreshInsights({ includeGraph: true, includeBranches: true });
        } catch (err) {
          if (!responded) {
            onFailure?.();
          }
          pushToast('error', (err as Error).message);
        } finally {
          finishBackgroundTask(taskId);
        }
      })();
    },
    [
      addQuestionBranchForNode,
      displayBranchName,
      ensureLeaseSessionReady,
      finishBackgroundTask,
      leaseSessionId,
      project.id,
      pushToast,
      refreshInsights,
      startBackgroundTask
    ]
  );

  const renameBranch = async () => {
    if (!renameTarget) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError('Branch name is required.');
      return;
    }
    if (!ensureLeaseSessionReady()) {
      return;
    }
    if (isPgMode) {
      const { lease } = getLeaseForBranchName(renameTarget.name);
      if (lease && lease.holderSessionId !== leaseSessionId) {
        setRenameError('Editing locked. Editor access required.');
        return;
      }
    }
    setIsRenaming(true);
    setRenameError(null);
    setBranchActionError(null);
    try {
      const branchId = getBranchIdentity(renameTarget);
      const res = await fetch(`/api/projects/${project.id}/branches/${encodeURIComponent(branchId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withLeaseSessionId({ name: nextName }, leaseSessionId))
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Rename failed');
      }
      const data = (await res.json()) as {
        branchName?: string;
        branchId?: string | null;
        branches?: BranchSummary[];
      };
      if (data.branchName) {
        setBranchName(data.branchName);
      }
      if (data.branches) {
        setBranches(data.branches);
      }
      closeRenameModal();
    } catch (err) {
      setRenameError((err as Error).message);
    } finally {
      setIsRenaming(false);
    }
  };

  const togglePinnedBranch = async (branch: BranchSummary) => {
    const branchId = getBranchIdentity(branch);
    if (pendingPinBranchIds.has(branchId)) return;
    setBranchActionError(null);
    setPendingPinBranchIds((prev) => new Set(prev).add(branchId));
    const prevBranches = branches;
    const optimistic = branches.map((item) =>
      item.name === branch.name ? { ...item, isPinned: !item.isPinned } : item
    );
    setBranches(optimistic);
    try {
      const url = branch.isPinned
        ? `/api/projects/${project.id}/branches/pin`
        : `/api/projects/${project.id}/branches/${encodeURIComponent(branchId)}/pin`;
      const method = branch.isPinned ? 'DELETE' : 'POST';
      const res = await fetch(url, { method });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Pin update failed');
      }
      const data = (await res.json()) as { branches?: BranchSummary[]; branchName?: string };
      if (data.branchName) {
        setBranchName(data.branchName);
      }
      if (data.branches) {
        setBranches(data.branches);
      }
    } catch (err) {
      setBranchActionError((err as Error).message);
      setBranches(prevBranches);
    } finally {
      setPendingPinBranchIds((prev) => {
        const next = new Set(prev);
        next.delete(branchId);
        return next;
      });
    }
  };

  const toggleBranchVisibility = async (branch: BranchSummary) => {
    const branchId = getBranchIdentity(branch);
    if (pendingVisibilityBranchIds.has(branchId)) return;
    const previousGraphHistories = graphHistories;
    const previousGraphViews = graphViews;
    const wasHidden = branch.isHidden;
    setBranchActionError(null);
    setPendingVisibilityBranchIds((prev) => new Set(prev).add(branchId));
    const prevBranches = branches;
    const optimistic = branches.map((item) =>
      item.name === branch.name ? { ...item, isHidden: !item.isHidden } : item
    );
    setBranches(optimistic);
    if (!wasHidden) {
      setGraphHistories((prev) => {
        if (!prev || !(branch.name in prev)) return prev;
        const { [branch.name]: _omit, ...rest } = prev;
        return rest;
      });
      setGraphViews(null);
    }
    try {
      const res = await fetch(`/api/projects/${project.id}/branches/${encodeURIComponent(branchId)}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHidden: !branch.isHidden })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Visibility update failed');
      }
      const data = (await res.json()) as { branches?: BranchSummary[]; branchName?: string };
      if (data.branchName) {
        setBranchName(data.branchName);
      }
      if (data.branches) {
        setBranches(data.branches);
      }
      await loadGraphHistories({ force: true });
    } catch (err) {
      setBranchActionError((err as Error).message);
      setBranches(prevBranches);
      setGraphHistories(previousGraphHistories ?? null);
      setGraphViews(previousGraphViews ?? null);
    } finally {
      setPendingVisibilityBranchIds((prev) => {
        const next = new Set(prev);
        next.delete(branchId);
        return next;
      });
    }
  };

  const ensureBranchVisible = async (branch: BranchSummary): Promise<boolean> => {
    if (!branch.isHidden) return true;
    const branchId = getBranchIdentity(branch);
    if (pendingVisibilityBranchIds.has(branchId)) return false;
    const prevBranches = branches;
    setBranchActionError(null);
    setPendingVisibilityBranchIds((prev) => new Set(prev).add(branchId));
    setBranches((prev) => prev.map((item) => (item.name === branch.name ? { ...item, isHidden: false } : item)));
    try {
      const res = await fetch(`/api/projects/${project.id}/branches/${encodeURIComponent(branchId)}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHidden: false })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Visibility update failed');
      }
      const data = (await res.json()) as { branches?: BranchSummary[]; branchName?: string };
      if (data.branchName) {
        setBranchName(data.branchName);
      }
      if (data.branches) {
        setBranches(data.branches);
      }
      await loadGraphHistories({ force: true });
      return true;
    } catch (err) {
      setBranchActionError((err as Error).message);
      setBranches(prevBranches);
      return false;
    } finally {
      setPendingVisibilityBranchIds((prev) => {
        const next = new Set(prev);
        next.delete(branchId);
        return next;
      });
    }
  };

  const submitEdit = () => {
    if (!editDraft.trim()) {
      setEditError('Content is required.');
      return;
    }
    if (!editBranchName.trim()) {
      setEditError('Branch name is required.');
      return;
    }
    setIsEditing(true);
    const editModel =
      providerOptions.find((option) => option.id === editProvider)?.defaultModel ??
      getDefaultModelForProviderFromCapabilities(editProvider);
    const fromRef = editingNode?.createdOnBranch ?? branchName;
    const targetBranch = editBranchName.trim();
    const content = editDraft.trim();
    const nodeId = editingNode?.id ?? null;
    const shouldSwitch = switchToEditBranch;

    setEditError(null);

    if (shouldSwitch) {
      if (!nodeId) {
        setEditError('Unable to resolve edited node.');
        setIsEditing(false);
        return;
      }
      void sendEditWithStream({
        targetBranch,
        content,
        fromRef,
        nodeId,
        provider: editProvider,
        model: editModel,
        thinkingSetting: editThinking,
        onResponse: () => {
          setIsEditing(false);
          setBranchName(targetBranch);
          resetEditState();
        },
        onFailure: () => {
          setIsEditing(false);
        }
      });
      return;
    }

    startEditTask({
      targetBranch,
      fromRef,
      content,
      provider: editProvider,
      model: editModel,
      thinkingSetting: editThinking,
      nodeId,
      switchOnComplete: shouldSwitch,
      onResponse: () => {
        setIsEditing(false);
        resetEditState();
      },
      onFailure: () => {
        setIsEditing(false);
      }
    });
  };

  const closeMergeModal = useCallback(() => {
    if (isMerging) return;
    setShowMergeModal(false);
    setMergeSummary('');
    setMergeError(null);
  }, [isMerging]);

  const handleNewBranchBackdrop = useMemo(
    () => buildModalBackdropHandler(closeNewBranchModal),
    [buildModalBackdropHandler, closeNewBranchModal]
  );

  const handleMergeBackdrop = useMemo(
    () => buildModalBackdropHandler(closeMergeModal),
    [buildModalBackdropHandler, closeMergeModal]
  );

  const handleRenameBackdrop = useMemo(
    () => buildModalBackdropHandler(closeRenameModal),
    [buildModalBackdropHandler, closeRenameModal]
  );

  const handleEditBackdrop = useMemo(
    () => buildModalBackdropHandler(closeEditModal),
    [buildModalBackdropHandler, closeEditModal]
  );
  const handleShareBackdrop = useMemo(
    () => buildModalBackdropHandler(closeShareModal),
    [buildModalBackdropHandler, closeShareModal]
  );
  const handleCreateWorkspaceBackdrop = useMemo(
    () => buildModalBackdropHandler(closeCreateWorkspaceModal),
    [buildModalBackdropHandler, closeCreateWorkspaceModal]
  );

  return (
    <>
      {toasts.length > 0 ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${toastToneClassName(toast.tone)}`}
            >
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                aria-label="Dismiss toast"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <RailPageLayout
        renderRail={(ctx) => {
          railStateRef.current = ctx;
          return (
            <div className="mt-6 flex h-full min-h-0 flex-col gap-6">
            {!ctx.railCollapsed ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="rounded-2xl border border-divider/70 bg-white/80 px-3 py-2 shadow-sm">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{project.name}</div>
                    {isSharedWorkspace ? (
                      <span
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-divider bg-white text-slate-700"
                        title="Shared with you"
                        role="img"
                        aria-label="Shared with you"
                      >
                        <SharedWorkspaceIcon className="h-3.5 w-3.5 rotate-180" />
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[11px] text-muted">{project.description ?? 'No description provided.'}</div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden">
                  <div className="flex items-center justify-between px-3 text-sm text-muted">
                    <span>Branches</span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-slate-700">
                      {isSwitching || isCreating || backgroundTasks.length > 0 ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                      ) : null}
                      {sortedBranches.length}
                    </span>
                  </div>
                  <div className="flex-1 space-y-1 overflow-y-auto pr-1">
                    {sortedBranches.map((branch) => {
                      const branchId = getBranchIdentity(branch);
                      const pinPending = pendingPinBranchIds.has(branchId);
                      const visibilityPending = pendingVisibilityBranchIds.has(branchId);
                      const isPending = pendingBranchNames.has(branch.name);
                      const isGhost = (branch as BranchListItem).isGhost ?? false;
                      const isHidden = branch.isHidden ?? false;
                      const isActiveBranch = branchName === branch.name;
                      const switchDisabled = isSwitching || isCreating || isRenaming || isGhost;
                      const visibilityDisabled =
                        isSwitching || isCreating || visibilityPending || isGhost || (!isHidden && isActiveBranch);
                      const { lease: branchLease } = getLeaseForBranchName(branch.name);
                      const branchLeaseHeldBySession = Boolean(branchLease && branchLease.holderSessionId === leaseSessionId);
                      const branchLeaseLocked = Boolean(branchLease && branchLease.holderSessionId !== leaseSessionId);
                      const branchMenuOpen = openBranchMenu === branch.name;
                      const branchStatusIcon = branchLeaseLocked ? 'lock' : branch.isPinned ? 'pin' : 'cog';
                      const branchStatusTone = branchLeaseLocked
                        ? 'text-amber-600'
                        : branch.isPinned
                          ? 'text-red-600'
                          : 'text-slate-500';
                      const branchHasStatus = branchLeaseLocked || branch.isPinned;
                      const branchStatusLabel = branchLeaseLocked
                        ? 'Branch is locked'
                        : branch.isPinned
                          ? 'Branch is pinned'
                          : null;
                      const branchStatusId = branchStatusLabel
                        ? `branch-status-${String(branchId).replace(/[^a-zA-Z0-9_-]/g, '-')}`
                        : undefined;
                      let branchMenuAnchorRef = branchMenuRefs.current.get(branch.name);
                      if (!branchMenuAnchorRef) {
                        branchMenuAnchorRef = React.createRef<HTMLButtonElement>();
                        branchMenuRefs.current.set(branch.name, branchMenuAnchorRef);
                      }
                      return (
                        <div
                          key={branch.name}
                          role="button"
                          tabIndex={switchDisabled ? -1 : 0}
                          onClick={() => {
                            if (switchDisabled) return;
                            void switchBranch(branch.name);
                          }}
                          onKeyDown={(event) => {
                            if (switchDisabled) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              void switchBranch(branch.name);
                            }
                          }}
                          aria-disabled={switchDisabled}
                          className={`group/branch w-full rounded-full px-3 py-2 text-left text-sm transition focus:outline-none ${
                            branchName === branch.name
                              ? 'bg-primary/15 text-primary shadow-sm'
                              : switchDisabled
                                ? 'text-slate-400'
                                : 'text-slate-700 hover:bg-white/80'
                          }`}
                          data-testid="branch-switch"
                          data-branch-name={branch.name}
                          data-branch-trunk={branch.isTrunk ? 'true' : undefined}
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
                                    : isHidden
                                      ? 'text-slate-400'
                                      : ''
                                }`}
                              >
                                {displayBranchName(branch.name)}
                              </span>
                              {isPending ? (
                                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                              ) : null}
                            </span>
                            <span className="relative inline-flex items-center gap-1" data-branch-menu data-branch-menu-name={branch.name}>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenBranchMenu((prev) => (prev === branch.name ? null : branch.name));
                                }}
                                ref={branchMenuAnchorRef}
                                className={`group/button inline-flex h-7 w-7 items-center justify-center rounded-full border border-divider/80 bg-white shadow-sm transition hover:bg-primary/10 hover:text-slate-700 ${
                                  branchHasStatus
                                    ? `${branchStatusTone} hover:text-slate-700`
                                    : 'text-slate-500 opacity-0 group-hover/branch:opacity-100 group-focus-within/branch:opacity-100'
                                }`}
                                aria-label={`Branch options for ${displayBranchName(branch.name)}`}
                                aria-describedby={branchStatusId}
                                aria-expanded={branchMenuOpen}
                              >
                                <span className="relative h-3.5 w-3.5">
                                  {branchHasStatus ? (
                                    <BlueprintIcon
                                      icon={branchStatusIcon}
                                      className="absolute left-0 top-0 h-3.5 w-3.5 transition-opacity duration-150 group-hover/button:opacity-0"
                                    />
                                  ) : null}
                                  <BlueprintIcon
                                    icon="cog"
                                    className={`absolute left-0 top-0 h-3.5 w-3.5 transition-opacity duration-150 ${
                                      branchHasStatus ? 'opacity-0 group-hover/button:opacity-100' : 'opacity-100'
                                    }`}
                                  />
                                </span>
                                {branchStatusLabel ? (
                                  <span id={branchStatusId} className="sr-only">
                                    {branchStatusLabel}
                                  </span>
                                ) : null}
                              </button>
                              {branchMenuOpen && branchMenuAnchorRef ? (
                                <div data-branch-menu className="absolute left-0 top-0 h-0 w-0">
                                  <RailPopover
                                    open={branchMenuOpen}
                                    anchorRef={branchMenuAnchorRef}
                                    ariaLabel={`Branch actions for ${displayBranchName(branch.name)}`}
                                    className="flex h-11 w-auto items-center gap-2 rounded-full px-2 py-1.5"
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void togglePinnedBranch(branch);
                                        setOpenBranchMenu(null);
                                      }}
                                      disabled={isSwitching || isCreating || pinPending || isGhost}
                                      title={branch.isPinned ? 'Unpin branch' : 'Pin branch'}
                                      aria-label={branch.isPinned ? 'Unpin branch' : 'Pin branch'}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/70 bg-white transition ${
                                        isSwitching || isCreating || pinPending || isGhost
                                          ? 'cursor-not-allowed text-slate-300'
                                          : branch.isPinned
                                            ? 'text-red-600 hover:bg-red-50'
                                            : 'text-slate-600 hover:bg-primary/10'
                                      }`}
                                    >
                                      {pinPending ? (
                                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                                      ) : (
                                        <BlueprintIcon icon="pin" className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void toggleBranchVisibility(branch);
                                        setOpenBranchMenu(null);
                                      }}
                                      disabled={visibilityDisabled}
                                      title={
                                        visibilityDisabled && !isHidden && isActiveBranch
                                          ? 'Cannot hide the current branch'
                                          : isHidden
                                            ? 'Show branch'
                                            : 'Hide branch'
                                      }
                                      aria-label={isHidden ? 'Show branch' : 'Hide branch'}
                                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/70 bg-white transition ${
                                        visibilityDisabled ? 'cursor-not-allowed text-slate-300' : 'text-slate-600 hover:bg-primary/10'
                                      }`}
                                    >
                                      {visibilityPending ? (
                                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                                      ) : (
                                        <BlueprintIcon icon={isHidden ? 'eye-open' : 'eye-off'} className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openRenameModal(branch);
                                        setOpenBranchMenu(null);
                                      }}
                                    disabled={branch.isTrunk || isSwitching || isCreating || isRenaming || isGhost}
                                    title="Rename branch"
                                    aria-label="Rename branch"
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/70 bg-white transition ${
                                      branch.isTrunk || isSwitching || isCreating || isRenaming || isGhost
                                        ? 'cursor-not-allowed text-slate-300'
                                        : 'text-slate-600 hover:bg-primary/10'
                                    }`}
                                  >
                                    <BlueprintIcon icon="edit" className="h-3.5 w-3.5" />
                                    </button>
                                    {shareUiVisible ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void releaseLease({
                                            refId: branch.id!,
                                            force: !branchLeaseHeldBySession && Boolean(project.isOwner)
                                          });
                                          setOpenBranchMenu(null);
                                        }}
                                        disabled={
                                          isReleasingLease ||
                                          !branchLease ||
                                          (!branchLeaseHeldBySession && !project.isOwner)
                                        }
                                        title={
                                          !branchLease
                                            ? 'No edit lock to release'
                                            : branchLeaseHeldBySession
                                              ? 'Release edit lock'
                                              : project.isOwner
                                                ? 'Force unlock editing'
                                                : 'Editing locked elsewhere'
                                        }
                                        aria-label="Release edit lock"
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/70 bg-white transition ${
                                          !branchLease || (!branchLeaseHeldBySession && !project.isOwner)
                                            ? 'cursor-not-allowed text-slate-300'
                                            : branchLeaseLocked && !project.isOwner
                                              ? 'text-slate-300'
                                              : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                      >
                                        <BlueprintIcon icon="unlock" className="h-3.5 w-3.5" />
                                      </button>
                                    ) : null}
                                  </RailPopover>
                                </div>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {branchActionError ? <p className="text-sm text-red-600">{branchActionError}</p> : null}
                </div>

                {features.uiRailBranchCreator ? (
                  <NewBranchFormCard
                    fromLabel={displayBranchName(branchName)}
                    value={newBranchName}
                    onValueChange={setNewBranchName}
                    onSubmit={() => void createBranch()}
                    disabled={isSwitching || isRenaming || branchActionDisabled}
                    submitting={isCreating}
                    error={branchActionError}
                    testId="branch-form-rail"
                    inputTestId="branch-form-rail-input"
                    submitTestId="branch-form-rail-submit"
                    providerSelector={
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
                          <span className="font-semibold text-slate-700">Provider</span>
                          <select
                            value={newBranchProvider}
                            onChange={(event) => setNewBranchProvider(event.target.value as LLMProvider)}
                            className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                            disabled={isSwitching || isCreating || isRenaming || branchActionDisabled}
                            data-testid="branch-provider-select-rail"
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
                            disabled={isSwitching || isCreating || isRenaming || branchActionDisabled}
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

              </div>
            ) : null}

            <div className="mt-auto flex flex-col items-start gap-3 pb-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCreateWorkspaceModal(true)}
                  className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                  aria-label="New workspace"
                  aria-haspopup="dialog"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
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
                    <li>⌘ + K to toggle the composer.</li>
                    <li>⌘ + Shift + K to collapse or restore all panels.</li>
                    <li>⌘ + click a graph node to jump to its nearest message.</li>
                    <li>⌥ + click a graph node to jump to its origin branch.</li>
                    <li>← Thred graph · → Canvas.</li>
                    <li>⌃ + B to toggle the graph/canvas panel.</li>
                    <li>Branch to try edits without losing the {TRUNK_LABEL}.</li>
                    <li>Canvas edits are per-branch; merge intentionally carries a diff summary.</li>
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href="https://github.com/benjaminfh/researchtree"
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
                      aria-label="Open GitHub repository"
                    >
                      <BlueprintIcon icon="git-repo" className="h-4 w-4" />
                      Repo
                    </a>
                    <a
                      href="https://github.com/benjaminfh/researchtree/issues"
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
                      aria-label="Open GitHub issues"
                    >
                      <BlueprintIcon icon="issue-new" className="h-4 w-4" />
                      New issue
                    </a>
                  </div>
                </RailPopover>
              </div>
              <AuthRailStatus railCollapsed={ctx.railCollapsed} onRequestExpandRail={ctx.toggleRail} />
              <Link
                href="/"
                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
                aria-label="Back to home"
                data-testid="back-to-home"
              >
                <HomeIcon className="h-4 w-4" />
              </Link>
            </div>
            </div>
          );
        }}
        renderMain={(ctx) => {
          railStateRef.current = ctx;
          return (
            <div
              className="relative flex h-full min-h-0 min-w-0 flex-col bg-white"
              data-composer-collapsed={composerCollapsed ? 'true' : 'false'}
            >
            <div className="sr-only" aria-live="polite" data-testid="composer-collapsed-state">
              {composerCollapsed ? 'Composer collapsed' : 'Composer expanded'}
            </div>
            <div
              className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-4 pt-3 md:px-8 lg:px-3"
              style={{ paddingBottom: composerPadding }}
              data-testid="workspace-scroll-container"
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
                      <div className="pointer-events-auto w-full md:ml-4 md:max-w-[calc(100%-12rem)]">
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
                      <div
                        ref={providerPillRef}
                        className="flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-1 text-xs shadow-sm"
                      >
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
                  className="relative flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto pr-1 pt-12"
                  style={{ paddingBottom: `${messageListPaddingBottom}px` }}
                  onScroll={handleMessageListScroll}
                  onWheel={handleUserScrollIntent}
                  onTouchStart={handleUserScrollIntent}
                >
                  <span
                    ref={messageLineHeightSampleRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute h-0 w-0 overflow-hidden text-sm leading-relaxed text-transparent"
                  >
                    M
                  </span>
                  {isLoading ? (
                    <div className="flex flex-col gap-3 animate-pulse" role="status" aria-live="polite">
                      <span className="sr-only">Loading history…</span>
                      <div className="ml-auto h-10 w-2/3 rounded-2xl bg-slate-100" />
                      <div className="h-16 w-full rounded-2xl bg-slate-100" />
                      <div className="ml-auto h-8 w-1/2 rounded-2xl bg-slate-100" />
                      <div className="h-14 w-5/6 rounded-2xl bg-slate-100" />
                    </div>
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
                                key={getNodeRenderKey(node)}
                                node={node}
                                projectId={project.id}
                                  trunkName={trunkName}
                                  currentBranchName={branchName}
                                defaultProvider={defaultProvider}
                                providerByBranch={providerByBranch}
                                branchColors={branchColorMap}
                                muted
                                messageInsetClassName="pr-3"
                                subtitle={node.createdOnBranch ? `from ${node.createdOnBranch}` : undefined}
                                isStarred={starredSet.has(node.id)}
                                isStarPending={pendingStarIds.has(node.id)}
                                onToggleStar={handleToggleStarForNode}
                                onEditNode={
                                  node.type === 'message' &&
                                  (node.role === 'user' || node.role === 'assistant' || features.uiEditAnyMessage)
                                    ? handleEditNode
                                    : undefined
                                }
                                isCanvasDiffTagged={undefined}
                                onTagCanvasDiff={undefined}
                                highlighted={jumpHighlightNodeId === node.id}
                                branchQuestionCandidate={
                                  node.type === 'message' &&
                                  node.role === 'assistant' &&
                                  activeBranchHighlight?.nodeId === node.id &&
                                  Boolean(activeBranchHighlight.text.trim())
                                }
                                questionBranchNames={resolveQuestionBranchNames(questionBranchesByNode[node.id] ?? [])}
                                isQuestionBranchesOpen={openQuestionBranchNodeId === node.id}
                                questionBranchIndex={openQuestionBranchIndex}
                                onToggleQuestionBranches={toggleQuestionBranchesForNode}
                                onQuestionBranchIndexChange={setOpenQuestionBranchIndex}
                                quoteSelectionText={
                                  activeBranchHighlight?.nodeId === node.id ? activeBranchHighlight.text : ''
                                }
                                highlightMenuPoint={
                                  activeBranchHighlight?.nodeId === node.id ? activeBranchHighlight.point ?? null : null
                                }
                                highlightMenuOffset={highlightMenuOffset}
                                showBranchSplit={showNewBranchModal && branchSplitNodeId === node.id}
                                branchActionDisabled={branchActionDisabled}
                                onQuoteReply={handleQuoteReply}
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
                          key={getNodeRenderKey(node)}
                          node={node}
                          projectId={project.id}
                          trunkName={trunkName}
                          currentBranchName={branchName}
                          defaultProvider={defaultProvider}
                          providerByBranch={providerByBranch}
                          branchColors={branchColorMap}
                          messageInsetClassName="pr-3"
                          isStarred={starredSet.has(node.id)}
                          isStarPending={pendingStarIds.has(node.id)}
                          onToggleStar={handleToggleStarForNode}
                          onEditNode={
                            node.type === 'message' &&
                            (node.role === 'user' || node.role === 'assistant' || features.uiEditAnyMessage)
                              ? handleEditNode
                              : undefined
                          }
                          isCanvasDiffTagged={node.type === 'merge' ? taggedCanvasDiffMergeIds.has(node.id) : undefined}
                          onTagCanvasDiff={node.type === 'merge' ? tagCanvasDiffToCurrentBranch : undefined}
                          highlighted={jumpHighlightNodeId === node.id}
                          branchQuestionCandidate={
                            node.type === 'message' &&
                            node.role === 'assistant' &&
                            activeBranchHighlight?.nodeId === node.id &&
                            Boolean(activeBranchHighlight.text.trim())
                          }
                          questionBranchNames={resolveQuestionBranchNames(questionBranchesByNode[node.id] ?? [])}
                          isQuestionBranchesOpen={openQuestionBranchNodeId === node.id}
                          questionBranchIndex={openQuestionBranchIndex}
                          onToggleQuestionBranches={toggleQuestionBranchesForNode}
                          onQuestionBranchIndexChange={setOpenQuestionBranchIndex}
                          quoteSelectionText={
                            activeBranchHighlight?.nodeId === node.id ? activeBranchHighlight.text : ''
                          }
                          highlightMenuPoint={
                            activeBranchHighlight?.nodeId === node.id ? activeBranchHighlight.point ?? null : null
                          }
                          highlightMenuOffset={highlightMenuOffset}
                          showBranchSplit={showNewBranchModal && branchSplitNodeId === node.id}
                          branchActionDisabled={branchActionDisabled}
                          onQuoteReply={handleQuoteReply}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {hasOverflow && !isNearBottom ? (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToBottom();
                      updateScrollState();
                    }}
                    className="absolute bottom-[calc(1rem+44px+12px)] right-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label="Jump to bottom"
                  >
                    <BlueprintIcon icon="chevron-down" className="h-4 w-4" />
                  </button>
                ) : null}

                {hideShared && branchNodes.length === 0 && sharedCount > 0 ? (
                  <p className="text-sm italic text-muted">No new messages on this branch yet.</p>
                ) : null}

                {sortedBranches.length > 0 || chatErrorMessage ? (
                  <div className="absolute bottom-4 left-4 right-10 flex items-center gap-3">
                    {chatErrorMessage ? (
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-red-200 bg-red-50 px-4 text-sm text-red-700">
                        <span className="min-w-0 flex-1 truncate">{chatErrorMessage}</span>
                      </div>
                    ) : (
                      <div className="flex-1" />
                    )}

                    {composerCollapsed ? (
                      <button
                        type="button"
                        onClick={() => expandComposer()}
                        disabled={state.isStreaming}
                        className="flex h-11 w-11 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Expand composer"
                        data-testid="composer-expand-button"
                      >
                        <ConsoleIcon className="h-5 w-5" />
                      </button>
                    ) : null}

                    {sortedBranches.length > 0 ? (
                      <div className="flex items-center gap-2">
                        {shareUiVisible && leaseLocked ? (
                          <div
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-divider/80 bg-amber-50 text-amber-700 shadow-sm"
                            aria-label="Editing locked (editor access required)"
                            title="Editing locked (editor access required)"
                          >
                            <BlueprintIcon icon="lock" className="h-4 w-4" />
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            setBranchActionError(null);
                            resetBranchQuestionState();
                            if (latestPersistedVisibleNodeId) {
                              setBranchSplitNodeId(latestPersistedVisibleNodeId);
                            } else {
                              setBranchSplitNodeId(null);
                            }
                            setShowNewBranchModal(true);
                          }}
                          disabled={isCreating || isSwitching || branchActionDisabled}
                          className="inline-flex h-11 items-center gap-2 rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10 disabled:opacity-60"
                          aria-label="Show branch creator"
                          title={branchActionDisabled ? 'Branching is disabled while streaming' : undefined}
                          data-testid="branch-new-button"
                        >
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                            <BlueprintIcon icon="git-new-branch" className="h-4 w-4" />
                          </span>
                          New branch
                        </button>

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
                            data-testid="merge-open-button"
                          >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <BlueprintIcon icon="git-merge" className="h-4 w-4" />
                            </span>
                            Merge…
                          </button>
                        ) : null}

                        {shareUiVisible ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!canShare) return;
                              setShareError(null);
                              setShowShareModal(true);
                            }}
                            disabled={!canShare}
                            title={canShare ? 'Share workspace' : 'Only owners can manage sharing'}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Share workspace"
                            data-testid="share-open-button"
                          >
                            <BlueprintIcon icon="share" className="h-4 w-4" />
                          </button>
                        ) : null}

                        {activeBranch ? (
                          <div className="relative">
                            <button
                              type="button"
                              ref={branchSettingsButtonRef}
                              onClick={() => setShowBranchSettings((prev) => !prev)}
                              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                              aria-label="Branch settings"
                              aria-expanded={showBranchSettings}
                            >
                              <BlueprintIcon icon="cog" className="h-4 w-4" />
                            </button>
                            {showBranchSettings ? (
                              <div
                                ref={branchSettingsPopoverRef}
                                className="absolute left-1/2 bottom-full z-50 mb-1 flex w-11 -translate-x-1/2 flex-col items-center gap-2 rounded-full border border-divider/80 bg-white/95 px-1 py-2 text-slate-700 shadow-lg backdrop-blur"
                                role="dialog"
                                aria-label="Branch settings"
                              >
                                {shareUiVisible ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void releaseLease({
                                        refId: activeBranch.id!,
                                        force: !leaseHeldBySession && Boolean(project.isOwner)
                                      });
                                      closeBranchSettings();
                                    }}
                                    disabled={
                                      isReleasingLease ||
                                      !activeBranchLease ||
                                      (!leaseHeldBySession && !project.isOwner)
                                    }
                                    title={
                                      !activeBranchLease
                                        ? 'No edit lock to release'
                                        : leaseHeldBySession
                                          ? 'Release edit lock'
                                          : project.isOwner
                                            ? 'Force unlock editing'
                                            : 'Editing locked elsewhere'
                                    }
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <BlueprintIcon icon="unlock" className="h-4 w-4" />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    openRenameModal(activeBranch);
                                    closeBranchSettings();
                                  }}
                                  disabled={activeBranch.isTrunk || isSwitching || isCreating || isRenaming}
                                  title="Rename branch"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <BlueprintIcon icon="edit" className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void togglePinnedBranch(activeBranch);
                                    closeBranchSettings();
                                  }}
                                  disabled={isSwitching || isCreating || pendingPinBranchIds.has(activeBranch.id ?? activeBranch.name)}
                                  title={activeBranch.isPinned ? 'Unpin branch' : 'Pin branch'}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <BlueprintIcon icon="pin" className="h-4 w-4" />
                                </button>
                              </div>
                            ) : null}
                          </div>
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
                  data-testid="insight-panel-show"
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
                        data-testid="insight-tab-graph"
                      >
                        Thred graph
                      </button>
                      <button
                        type="button"
                        onClick={() => setInsightTab('canvas')}
                        className={`flex-1 rounded-full px-3 py-1 transition ${
                          insightTab === 'canvas' ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                        }`}
                        data-testid="insight-tab-canvas"
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
                      <div className="flex-1 min-h-0" data-testid="graph-panel">
                        {graphHistoryLoading && !graphHistories ? (
                          <div className="flex h-full items-center justify-center">
                            <div className="h-full w-full animate-pulse rounded-2xl bg-slate-100" />
                          </div>
                        ) : graphHistoryError ? (
                          <div className="flex h-full items-center justify-center text-sm text-red-600">{graphHistoryError}</div>
                        ) : (
                          <div className="flex h-full min-h-0 flex-col">
                            <WorkspaceGraph
                              branchHistories={graphHistories ?? {}}
                              graphViews={graphViews ?? undefined}
                              activeBranchName={branchName}
                              trunkName={trunkName}
                              branchColors={branchColorMap}
                              mode={graphMode}
                              onModeChange={setGraphMode}
                              starredNodeIds={stableStarredNodeIds}
                              selectedNodeId={selectedGraphNodeId}
                              onSelectNode={(nodeId) => setSelectedGraphNodeId(nodeId)}
                              onNavigateNode={(nodeId, options) => void jumpToGraphNode(nodeId, options)}
                            />
                            {selectedGraphNodeId ? (
                              <div className="border-t border-divider/80 bg-white/90 p-3 text-sm backdrop-blur">
                                {(() => {
                                  const resolved = resolveGraphNode(selectedGraphNodeId);
                                  if (!resolved) {
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

                                  const { record, targetBranch } = resolved;
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
                                  const isCanvasDiffTagged =
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
                                          isCanvasDiffTagged ? (
                                            <span className="self-center text-xs font-semibold text-emerald-700" aria-label="Canvas changes already tagged">
                                              Canvas changes tagged
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
                                                        await tagCanvasDiffToCurrentBranch(mergeRecord.id);
                                                      } else {
                                                        const result = await tagCanvasDiffToContext(mergeRecord.id, targetBranch);
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
                                                {isGraphDetailBusy ? (
                                                  <span className="inline-flex items-center gap-2">
                                                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                                                    <span>Adding…</span>
                                                  </span>
                                                ) : (
                                                  'Confirm'
                                                )}
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
                                          onClick={() => {
                                            if (!selectedGraphNodeId) return;
                                            void jumpToGraphNode(selectedGraphNodeId);
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
                              {isLoading ? (
                                <div className="flex h-full flex-col gap-3 p-4 animate-pulse">
                                  <div className="h-4 w-3/4 rounded-full bg-slate-100" />
                                  <div className="h-4 w-5/6 rounded-full bg-slate-100" />
                                  <div className="h-4 w-2/3 rounded-full bg-slate-100" />
                                  <div className="h-4 w-4/5 rounded-full bg-slate-100" />
                                  <div className="mt-auto h-4 w-1/3 rounded-full bg-slate-100" />
                                </div>
                              ) : (
                                <div className="relative h-full">
                                  <textarea
                                    value={artefactDraft}
                                    onChange={(event) => setArtefactDraft(event.target.value)}
                                    onFocus={() => setIsCanvasFocused(true)}
                                    onBlur={() => setIsCanvasFocused(false)}
                                    className="h-full w-full resize-none bg-transparent px-4 py-4 pb-12 text-sm leading-relaxed text-slate-800 focus:outline-none disabled:opacity-60"
                                    data-testid="canvas-editor"
                                    disabled={canvasDisabled}
                                  />
                                  {!isCanvasFocused && artefactDraft.length === 0 ? (
                                    <div className="pointer-events-none absolute left-4 top-4 text-sm text-slate-400">
                                      Add notes to the canvas…
                                    </div>
                                  ) : null}
                                  {isSavingArtefact || artefactError ? (
                                    <div
                                      className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 backdrop-blur"
                                      data-testid="canvas-save-indicator"
                                    >
                                      {isSavingArtefact ? (
                                        <>
                                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-primary/70" />
                                          <span>Saving…</span>
                                        </>
                                      ) : null}
                                      {!isSavingArtefact && artefactError ? (
                                        <span className="text-red-600">{artefactError}</span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              )}
		                        </InsightFrame>
		                      </div>
	                    )}
	                  </div>
	                </section>
	              )}
            </div>
          </div>
        </div>

          {!composerCollapsed ? (
            <WorkspaceComposer
              ref={composerHandleRef}
              railCollapsed={ctx.railCollapsed}
              draftStorageKey={draftStorageKey}
              isInputDisabled={composerInputDisabled}
              isActionDisabled={composerActionDisabled}
              isStreaming={state.isStreaming}
              isSending={isSending}
              thinkingUnsupportedError={thinkingUnsupportedError}
              webSearchAvailable={webSearchAvailable}
              webSearchEnabled={webSearchEnabled}
              showOpenAISearchNote={showOpenAISearchNote}
              thinking={thinking}
              allowedThinking={allowedThinking}
              onSubmitDraft={sendDraft}
              onInterrupt={interrupt}
              onThinkingChange={setThinking}
              onWebSearchToggle={() => setWebSearchEnabled((prev) => !prev)}
              onComposerErrorChange={setChatComposerError}
              onComposerPaddingChange={(value) => {
                composerExpandedPaddingRef.current = value;
                if (!composerCollapsed) {
                  setComposerPadding(value);
                }
              }}
              pushToast={pushToast}
              convertHtmlToMarkdown={convertHtmlToMarkdown}
            />
          ) : null}
            </div>
          );
        }}
      />

      {showCreateWorkspaceModal ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onMouseDown={handleCreateWorkspaceBackdrop}
          onTouchStart={handleCreateWorkspaceBackdrop}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" data-testid="create-workspace-modal">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <PlusIcon className="h-4 w-4" />
                </span>
                New workspace
              </div>
              <button
                type="button"
                onClick={closeCreateWorkspaceModal}
                className="rounded-full border border-divider/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10"
                aria-label="Close new workspace dialog"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <CreateProjectForm
                providerOptions={providerOptions}
                defaultProvider={defaultProvider}
                openInNewTab
                onCreated={closeCreateWorkspaceModal}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showNewBranchModal ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onMouseDown={handleNewBranchBackdrop}
          onTouchStart={handleNewBranchBackdrop}
        >
          <div
            ref={newBranchModalRef}
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
            data-testid="branch-modal"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <BlueprintIcon icon="git-new-branch" className="h-4 w-4" />
                </span>
                New branch
              </div>
              <button
                type="button"
                onClick={closeNewBranchModal}
                className="rounded-full border border-divider/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-primary/10"
                aria-label="Hide branch creator"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <NewBranchFormCard
                fromLabel={displayBranchName(branchName)}
                value={newBranchName}
                onValueChange={setNewBranchName}
                onSubmit={async () => {
                  const isQuestionMode = branchModalMode === 'question' && Boolean(newBranchHighlight.trim());
                  const question = newBranchQuestion.trim();
                  const highlight = newBranchHighlight.trim() || undefined;
                  const thinkingSetting = newBranchThinking;
                  if (isQuestionMode && !question) {
                    setBranchActionError('Question is required.');
                    return;
                  }
                  if (isQuestionMode && highlight && highlight.length > CHAT_LIMITS.highlightMaxChars) {
                    setBranchActionError(
                      formatCharLimitMessage('Highlight', highlight.length, CHAT_LIMITS.highlightMaxChars)
                    );
                    return;
                  }
                  if (isQuestionMode && question.length > CHAT_LIMITS.questionMaxChars) {
                    setBranchActionError(
                      formatCharLimitMessage('Question', question.length, CHAT_LIMITS.questionMaxChars)
                    );
                    return;
                  }
                  if (isQuestionMode) {
                    const canCreate = await ensureCanvasSavedForBranchSwitch();
                    if (!canCreate) {
                      return;
                    }
                    const branchNameInput = newBranchName.trim();
                    if (!branchNameInput) {
                      setBranchActionError('Branch name is required.');
                      return;
                    }
                    const branchModel =
                      providerOptions.find((option) => option.id === newBranchProvider)?.defaultModel ??
                      getDefaultModelForProviderFromCapabilities(newBranchProvider);
                    if (switchToNewBranch) {
                      setIsCreating(true);
                      void sendQuestionWithStream({
                        targetBranch: branchNameInput,
                        fromRef: branchName,
                        fromNodeId: branchSplitNodeId,
                        question,
                        highlight,
                        provider: newBranchProvider,
                        model: branchModel,
                        thinkingSetting,
                        onResponse: () => {
                          setIsCreating(false);
                          setBranchName(branchNameInput);
                          setBranchActionError(null);
                          closeNewBranchModal();
                          setNewBranchName('');
                        },
                        onFailure: () => {
                          setIsCreating(false);
                        }
                      });
                      return;
                    }
                    setIsCreating(true);
                    startBranchQuestionTask({
                      targetBranch: branchNameInput,
                      fromRef: branchName,
                      fromNodeId: branchSplitNodeId,
                      question,
                      highlight,
                      provider: newBranchProvider,
                      model: branchModel,
                      thinkingSetting,
                      switchOnCreate: false,
                      onResponse: () => {
                        setIsCreating(false);
                        setBranchActionError(null);
                        closeNewBranchModal();
                        setNewBranchName('');
                      },
                      onFailure: () => {
                        setIsCreating(false);
                      }
                    });
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem(
                        `researchtree:thinking:${project.id}:${branchNameInput}`,
                        thinkingSetting
                      );
                    }
                  } else {
                    const result = await createBranch();
                    if (!result.ok) return;
                  }
                  setBranchActionError(null);
                  closeNewBranchModal();
                  setNewBranchName('');
                }}
                disabled={isSwitching || branchActionDisabled}
                submitting={isCreating}
                error={branchActionError}
                testId="branch-form-modal"
                inputTestId="branch-form-modal-input"
                submitTestId="branch-form-modal-submit"
                providerSelector={
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
                      <span className="font-semibold text-slate-700">Provider</span>
                      <select
                        value={newBranchProvider}
                        onChange={(event) => setNewBranchProvider(event.target.value as LLMProvider)}
                        className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none"
                        disabled={isSwitching || isCreating || isRenaming || branchActionDisabled}
                        data-testid="branch-provider-select"
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
                        disabled={isSwitching || isCreating || isRenaming || branchActionDisabled}
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
                autoFocus={!(branchModalMode === 'question' && Boolean(newBranchHighlight.trim()))}
                variant="plain"
              >
                {branchModalMode === 'question' && Boolean(newBranchHighlight.trim()) ? (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-800" htmlFor="branch-highlight">
                        Highlight
                      </label>
                      <textarea
                        id="branch-highlight"
                        value={newBranchHighlight}
                        onChange={(event) => setNewBranchHighlight(event.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-divider/80 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
                        readOnly={Boolean(newBranchHighlight)}
                        placeholder="No highlight captured"
                      />
                      <p className="text-xs text-muted">
                        Captured from your selection when branching from a message.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-800" htmlFor="branch-question">
                        Question<span className="text-rose-600">*</span>
                      </label>
                      <textarea
                        id="branch-question"
                        value={newBranchQuestion}
                        onChange={(event) => {
                          setNewBranchQuestion(event.target.value);
                          if (branchActionError) {
                            setBranchActionError(null);
                          }
                        }}
                        rows={3}
                        required
                        className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm leading-relaxed shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none"
                        placeholder="What do you want to ask on this branch?"
                        disabled={isSwitching || isCreating}
                        autoFocus={branchModalMode === 'question' && Boolean(newBranchHighlight.trim())}
                      />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-divider/80 text-primary focus:ring-primary/40"
                        checked={switchToNewBranch}
                        onChange={(event) => setSwitchToNewBranch(event.target.checked)}
                        disabled={isCreating || isSwitching}
                      />
                      Switch to the new branch after creating
                    </label>
                  </div>
                ) : null}
              </NewBranchFormCard>
            </div>
          </div>
        </div>
      ) : null}

      {showMergeModal ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onMouseDown={handleMergeBackdrop}
          onTouchStart={handleMergeBackdrop}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" data-testid="merge-modal">
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
                data-testid="merge-target"
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
                data-testid="merge-summary"
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
              <div
                className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-divider/80 bg-slate-50 font-mono text-xs text-slate-800"
                data-testid="merge-diff"
              >
                {isMergePreviewLoading ? (
                  <div className="space-y-2 px-3 py-3 animate-pulse">
                    <div className="h-3 w-5/6 rounded-full bg-slate-200" />
                    <div className="h-3 w-2/3 rounded-full bg-slate-200" />
                    <div className="h-3 w-4/5 rounded-full bg-slate-200" />
                    <div className="h-3 w-1/2 rounded-full bg-slate-200" />
                  </div>
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
                  const canMerge = await ensureCanvasSavedForBranchSwitch();
                  if (!canMerge) {
                    return;
                  }
                  if (!ensureLeaseSessionReady()) {
                    return;
                  }
                  if (isPgMode) {
                    const { lease: sourceLease } = getLeaseForBranchName(branchName);
                    const { lease: targetLease } = getLeaseForBranchName(mergeTargetBranch);
                    if (sourceLease && sourceLease.holderSessionId !== leaseSessionId) {
                      setMergeError('Source branch editing is locked. Editor access required.');
                      return;
                    }
                    if (targetLease && targetLease.holderSessionId !== leaseSessionId) {
                      setMergeError('Target branch editing is locked. Editor access required.');
                      return;
                    }
                  }
                  setIsMerging(true);
                  setMergeError(null);
                  try {
                    const res = await fetch(`/api/projects/${project.id}/merge`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(
                        withLeaseSessionId(
                          {
                            sourceBranch: branchName,
                            targetBranch: mergeTargetBranch,
                            mergeSummary: mergeSummary.trim(),
                            sourceAssistantNodeId: selectedMergePayload.id
                          },
                          leaseSessionId
                        )
                      )
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => null);
                      throw new Error(data?.error?.message ?? 'Merge failed');
                    }
                    const data = (await res.json().catch(() => null)) as { mergeNode?: { id: string } } | null;
                    const mergeNodeId = data?.mergeNode?.id ?? null;
                    if (mergeNodeId) {
                      // TODO: Reintroduce post-merge jump/highlight in chat (scroll to new merge node).
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
                data-testid="merge-submit"
              >
                {isMerging ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                    <span>Merging…</span>
                  </span>
                ) : (
                  `Merge into ${displayBranchName(mergeTargetBranch)}`
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRenameModal && renameTarget ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onMouseDown={handleRenameBackdrop}
          onTouchStart={handleRenameBackdrop}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" data-testid="rename-modal">
            <h3 className="text-lg font-semibold text-slate-900">Rename branch</h3>
            <p className="text-sm text-muted">This only changes the label. History, drafts, and Canvas stay intact.</p>
            <div className="mt-4 space-y-2">
              <label className="text-sm font-medium text-slate-800" htmlFor="rename-branch-name">
                Branch name
              </label>
              <input
                id="rename-branch-name"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                disabled={isRenaming}
                required
                data-testid="rename-branch-name"
              />
            </div>
            {renameError ? <p className="mt-2 text-sm text-red-600">{renameError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRenameModal}
                className="rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                disabled={isRenaming}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void renameBranch()}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isRenaming}
              >
                {isRenaming ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                    <span>Renaming…</span>
                  </span>
                ) : (
                  'Rename'
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal && editingNode ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onMouseDown={handleEditBackdrop}
          onTouchStart={handleEditBackdrop}
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl" data-testid="edit-modal">
            <CommandEnterForm
              onSubmit={(event) => {
                event.preventDefault();
                submitEdit();
              }}
              className="space-y-4"
            >
            <h3 className="text-lg font-semibold text-slate-900">Edit message (new branch)</h3>
            <p className="text-sm text-muted">Editing creates a new branch from this message.</p>
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
                data-testid="edit-branch-name"
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
                  data-testid="edit-provider-select"
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
                data-testid="edit-content"
                required
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-divider/80 text-primary focus:ring-primary/40"
                checked={switchToEditBranch}
                onChange={(event) => setSwitchToEditBranch(event.target.checked)}
                disabled={isEditing}
              />
              Switch to the new branch after creating
            </label>
            {editError ? <p className="mt-2 text-sm text-red-600">{editError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                disabled={isEditing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={isEditing}
                data-testid="edit-submit"
              >
                {isEditing ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                    <span>Creating branch…</span>
                  </span>
                ) : (
                  switchToEditBranch ? 'Save & switch' : 'Save'
                )}
              </button>
            </div>
            </CommandEnterForm>
          </div>
        </div>
      ) : null}

      {showShareModal ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4"
          onMouseDown={handleShareBackdrop}
          onTouchStart={handleShareBackdrop}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" data-testid="share-modal">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Share workspace</h3>
                <p className="text-sm text-muted">Invite collaborators and manage roles.</p>
              </div>
              <button
                type="button"
                onClick={closeShareModal}
                className="rounded-full border border-divider/80 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-primary/10 disabled:opacity-60"
                disabled={isShareSaving}
              >
                Close
              </button>
            </div>

            <CommandEnterForm
              onSubmit={(event) => {
                event.preventDefault();
                void submitShareInvite();
              }}
              enableCommandEnter={!isShareSaving && Boolean(shareEmailTrimmed) && isShareEmailValid}
              className="mt-4 space-y-3 rounded-2xl border border-divider/80 bg-slate-50/70 p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.target.value)}
                  placeholder="Invite by email"
                  className="min-w-[220px] flex-1 rounded-lg border border-divider/80 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                  disabled={isShareSaving}
                  aria-invalid={Boolean(shareEmailTrimmed) && !isShareEmailValid}
                  required
                />
                <select
                  value={shareRole}
                  onChange={(event) => setShareRole(event.target.value as 'viewer' | 'editor')}
                  className="rounded-lg border border-divider/80 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
                  disabled={isShareSaving}
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  type="submit"
                  className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={isShareSaving || !shareEmailTrimmed || !isShareEmailValid}
                >
                  {isShareSaving ? 'Inviting…' : 'Invite'}
                </button>
              </div>
            </CommandEnterForm>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-800">Members</h4>
                {shareLoadError ? (
                  <p className="text-xs text-red-600">Unable to load members.</p>
                ) : shareData ? (
                  shareMembers.length > 0 ? (
                    <div className="space-y-2">
                      {shareMembers.map((member) => {
                        const isOwnerRole = member.role === 'owner';
                        const pending = pendingShareIds.has(member.userId);
                        return (
                          <div
                            key={member.userId}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-divider/80 bg-white px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-800">{member.email ?? member.userId}</div>
                              <div className="text-[11px] text-muted">Joined {new Date(member.createdAt).toLocaleDateString()}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={member.role}
                                onChange={(event) =>
                                  updateShareRole({
                                    type: 'member',
                                    id: member.userId,
                                    role: event.target.value as 'viewer' | 'editor'
                                  })
                                }
                                className="rounded-full border border-divider/70 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                disabled={isOwnerRole || pending}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                                {isOwnerRole ? <option value="owner">Owner</option> : null}
                              </select>
                              <button
                                type="button"
                                onClick={() => removeShareEntry({ type: 'member', id: member.userId })}
                                disabled={isOwnerRole || pending}
                                className="rounded-full border border-divider/70 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No members yet.</p>
                  )
                ) : (
                  <p className="text-xs text-muted">Loading members…</p>
                )}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-800">Invites</h4>
                {shareLoadError ? (
                  <p className="text-xs text-red-600">Unable to load invites.</p>
                ) : shareData ? (
                  shareInvites.length > 0 ? (
                    <div className="space-y-2">
                      {shareInvites.map((invite) => {
                        const pending = pendingShareIds.has(invite.id);
                        return (
                          <div
                            key={invite.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-divider/80 bg-white px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-800">{invite.email}</div>
                              <div className="text-[11px] text-muted">
                                Invited {new Date(invite.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select
                                value={invite.role}
                                onChange={(event) =>
                                  updateShareRole({
                                    type: 'invite',
                                    id: invite.id,
                                    role: event.target.value as 'viewer' | 'editor'
                                  })
                                }
                                className="rounded-full border border-divider/70 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700"
                                disabled={pending}
                              >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removeShareEntry({ type: 'invite', id: invite.id })}
                                disabled={pending}
                                className="rounded-full border border-divider/70 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted">No pending invites.</p>
                  )
                ) : (
                  <p className="text-xs text-muted">Loading invites…</p>
                )}
              </div>
            </div>
            {shareError ? <p className="mt-4 text-sm text-red-600">{shareError}</p> : null}
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
