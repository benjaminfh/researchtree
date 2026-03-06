// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { useCallback, useRef, useState } from 'react';
import type { LLMProvider } from '@/src/server/llm';
import type { ThinkingSetting } from '@/src/shared/thinking';
import { consumeNdjsonStream } from '@/src/utils/ndjsonStream';

export interface ChatStreamState {
  isStreaming: boolean;
  error: string | null;
  errorCode?: string | null;
  errorDetails?: Record<string, unknown> | null;
}

export interface ChatStreamChunk {
  type: 'text' | 'thinking' | 'thinking_signature' | 'error';
  content?: string;
  message?: string;
  append?: boolean;
}

export interface ChatSendPayload {
  message?: string;
  question?: string;
  highlight?: string;
  intent?: string;
  ref?: string;
  llmProvider: LLMProvider;
  thinking?: ThinkingSetting;
  webSearch?: boolean;
  leaseSessionId?: string;
  clientRequestId?: string;
}

export interface StreamRequestOptions {
  url: string;
  body: Record<string, unknown>;
  onResponse?: (response: Response) => void;
  debugLabel?: string;
}

interface UseChatStreamOptions {
  projectId: string;
  ref?: string;
  thinking?: ThinkingSetting;
  webSearch?: boolean;
  leaseSessionId?: string | null;
  onChunk?: (chunk: ChatStreamChunk) => void;
  onComplete?: () => void;
}

export function useChatStream({
  projectId,
  ref,
  thinking,
  webSearch,
  leaseSessionId,
  onChunk,
  onComplete
}: UseChatStreamOptions) {
  const [state, setState] = useState<ChatStreamState>({
    isStreaming: false,
    error: null,
    errorCode: null,
    errorDetails: null
  });
  const activeRequest = useRef<AbortController | null>(null);
  const activeRequestId = useRef<string | null>(null);
  const streamDebugStateRef = useRef({
    seq: 0,
    totalChars: 0,
    lastType: '',
    lastContent: ''
  });

  const streamDebugEnabled =
    (typeof window !== 'undefined' && (window as any).__RT_STREAM_DEBUG === true) ||
    process.env.NEXT_PUBLIC_STREAM_DEBUG === 'true';

  const sendStreamRequest = useCallback(
    async ({ url, body, onResponse, debugLabel }: StreamRequestOptions) => {
      if (streamDebugEnabled) {
        streamDebugStateRef.current = { seq: 0, totalChars: 0, lastType: '', lastContent: '' };
        console.debug('[stream][start]', {
          projectId,
          label: debugLabel,
          url
        });
      }
      setState({ isStreaming: true, error: null, errorCode: null, errorDetails: null });
      activeRequest.current = new AbortController();
      activeRequestId.current = null;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: activeRequest.current.signal
        });

        activeRequestId.current = (response as any)?.headers?.get?.('x-rt-request-id') ?? null;

        if (!response.ok || !response.body) {
          let message = 'Chat request failed';
          let errorCode: string | null = null;
          let errorDetails: Record<string, unknown> | null = null;
          try {
            const data = (await response.json()) as any;
            const candidate = data?.error?.message;
            if (typeof candidate === 'string' && candidate.trim()) {
              message = candidate.trim();
            }
            if (typeof data?.error?.code === 'string' && data.error.code.trim()) {
              errorCode = data.error.code.trim();
            }
            if (data?.error?.details && typeof data.error.details === 'object') {
              errorDetails = data.error.details as Record<string, unknown>;
            }
          } catch {
            // ignore
          }
          const reqId = activeRequestId.current;
          const error = new Error(reqId ? `${message} (requestId=${reqId})` : message) as Error & {
            chatErrorCode?: string | null;
            chatErrorDetails?: Record<string, unknown> | null;
          };
          error.chatErrorCode = errorCode;
          error.chatErrorDetails = errorDetails;
          throw error;
        }

        onResponse?.(response);
        const reader = response.body.getReader();
        let streamErrorMessage: string | null = null;
        const { errorMessage } = await consumeNdjsonStream<ChatStreamChunk>(reader, {
          defaultErrorMessage: 'Chat request failed',
          onError: (message) => {
            streamErrorMessage = message;
            setState({ isStreaming: false, error: message, errorCode: null, errorDetails: null });
          },
          onFrame: (parsed) => {
            if (!parsed || typeof parsed.content !== 'string' || parsed.type === 'error') {
              return;
            }
            if (streamDebugEnabled) {
              const content = parsed.content ?? '';
              const sameAsLast =
                parsed.type === streamDebugStateRef.current.lastType && content === streamDebugStateRef.current.lastContent;
              const sample = content
                ? content.replace(/\s+/g, ' ').slice(0, 60)
                : '';
              streamDebugStateRef.current.seq += 1;
              streamDebugStateRef.current.totalChars += content.length;
              console.debug('[stream][chunk]', {
                seq: streamDebugStateRef.current.seq,
                type: parsed.type,
                append: parsed.append,
                length: content.length,
                totalChars: streamDebugStateRef.current.totalChars,
                sameAsLast,
                sample
              });
              streamDebugStateRef.current.lastType = parsed.type;
              streamDebugStateRef.current.lastContent = content;
            }
            onChunk?.(parsed);
          }
        });
        if (errorMessage || streamErrorMessage) {
          return;
        }

        onComplete?.();
        if (streamDebugEnabled) {
          console.debug('[stream][complete]', {
            requestId: activeRequestId.current,
            totalChunks: streamDebugStateRef.current.seq,
            totalChars: streamDebugStateRef.current.totalChars
          });
        }
        setState({ isStreaming: false, error: null, errorCode: null, errorDetails: null });
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
          setState({ isStreaming: false, error: null, errorCode: null, errorDetails: null });
        } else {
          const reqId = activeRequestId.current;
          console.error('[useChatStream] error', error);
          const base = (error as Error)?.message ?? 'Unable to send message';
          const withRequestId = reqId && !base.includes(`requestId=${reqId}`) ? `${base} (requestId=${reqId})` : base;
          setState({
            isStreaming: false,
            error: withRequestId,
            errorCode: ((error as any)?.chatErrorCode as string | null | undefined) ?? null,
            errorDetails: ((error as any)?.chatErrorDetails as Record<string, unknown> | null | undefined) ?? null
          });
        }
      } finally {
        activeRequest.current = null;
        activeRequestId.current = null;
      }
    },
    [projectId, onChunk, onComplete, streamDebugEnabled]
  );

  const sendMessage = useCallback(
    async (input: ChatSendPayload) => {
      const normalized = input;
      const userMessage = normalized.message ?? '';
      const userQuestion = normalized.question ?? '';
      if (!(userMessage.trim() || userQuestion.trim())) {
        return;
      }
      if (!normalized.llmProvider) {
        setState({
          isStreaming: false,
          error: 'Provider is required to send chat.',
          errorCode: null,
          errorDetails: null
        });
        return;
      }
      if (streamDebugEnabled) {
        streamDebugStateRef.current = { seq: 0, totalChars: 0, lastType: '', lastContent: '' };
        console.debug('[stream][start]', {
          projectId,
          ref: normalized.ref ?? ref,
          provider: normalized.llmProvider,
          thinking: normalized.thinking ?? thinking,
          webSearch: normalized.webSearch ?? webSearch,
          messageLength: (normalized.message ?? '').length,
          questionLength: (normalized.question ?? '').length,
          highlightLength: (normalized.highlight ?? '').length
        });
      }
      const basePayload: Record<string, unknown> = {
        message: normalized.message,
        question: normalized.question,
        highlight: normalized.highlight,
        intent: normalized.intent,
        llmProvider: normalized.llmProvider,
        ref: normalized.ref ?? ref,
        thinking: normalized.thinking ?? thinking,
        webSearch: normalized.webSearch ?? webSearch,
        clientRequestId: normalized.clientRequestId
      };
      const resolvedLeaseSessionId = normalized.leaseSessionId ?? leaseSessionId;
      const requestBody = resolvedLeaseSessionId ? { ...basePayload, leaseSessionId: resolvedLeaseSessionId } : basePayload;
      await sendStreamRequest({
        url: `/api/projects/${projectId}/chat`,
        body: requestBody
      });
    },
    [projectId, ref, thinking, webSearch, sendStreamRequest, streamDebugEnabled, leaseSessionId]
  );

  const interrupt = useCallback(async () => {
    if (activeRequest.current) {
      activeRequest.current.abort();
    }
    const interruptUrl = ref
      ? `/api/projects/${projectId}/interrupt?ref=${encodeURIComponent(ref)}`
      : `/api/projects/${projectId}/interrupt`;
    await fetch(interruptUrl, { method: 'POST' });
  }, [projectId, ref]);

  return {
    sendMessage,
    sendStreamRequest,
    interrupt,
    state
  };
}
