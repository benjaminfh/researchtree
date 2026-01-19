// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { useCallback, useRef, useState } from 'react';
import type { LLMProvider } from '@/src/server/llm';
import type { ThinkingSetting } from '@/src/shared/thinking';
import { consumeNdjsonStream } from '@/src/utils/ndjsonStream';

export interface ChatStreamState {
  isStreaming: boolean;
  error: string | null;
}

export interface ChatStreamChunk {
  type: 'text' | 'thinking' | 'thinking_signature' | 'error';
  content?: string;
  message?: string;
  append?: boolean;
}

export type ChatSendPayload =
  | string
  | {
      message?: string;
      question?: string;
      highlight?: string;
      intent?: string;
      refId?: string;
      ref?: string;
      llmProvider?: LLMProvider;
      thinking?: ThinkingSetting;
      webSearch?: boolean;
      leaseSessionId?: string;
    };

export interface StreamRequestOptions {
  url: string;
  body: Record<string, unknown>;
  onResponse?: (response: Response) => void;
  debugLabel?: string;
}

interface UseChatStreamOptions {
  projectId: string;
  refId?: string;
  ref?: string;
  provider?: LLMProvider;
  thinking?: ThinkingSetting;
  webSearch?: boolean;
  leaseSessionId?: string | null;
  onChunk?: (chunk: ChatStreamChunk) => void;
  onComplete?: () => void;
}

export function useChatStream({
  projectId,
  refId,
  ref,
  provider,
  thinking,
  webSearch,
  leaseSessionId,
  onChunk,
  onComplete
}: UseChatStreamOptions) {
  const [state, setState] = useState<ChatStreamState>({ isStreaming: false, error: null });
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
      setState({ isStreaming: true, error: null });
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
          try {
            const data = (await response.json()) as any;
            const candidate = data?.error?.message;
            if (typeof candidate === 'string' && candidate.trim()) {
              message = candidate.trim();
            }
          } catch {
            // ignore
          }
          const reqId = activeRequestId.current;
          throw new Error(reqId ? `${message} (requestId=${reqId})` : message);
        }

        onResponse?.(response);
        const reader = response.body.getReader();
        let streamErrorMessage: string | null = null;
        const { errorMessage } = await consumeNdjsonStream<ChatStreamChunk>(reader, {
          defaultErrorMessage: 'Chat request failed',
          onError: (message) => {
            streamErrorMessage = message;
            setState({ isStreaming: false, error: message });
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
        setState({ isStreaming: false, error: null });
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
          setState({ isStreaming: false, error: null });
        } else {
          const reqId = activeRequestId.current;
          console.error('[useChatStream] error', error);
          const base = (error as Error)?.message ?? 'Unable to send message';
          setState({ isStreaming: false, error: reqId && !base.includes(`requestId=${reqId}`) ? `${base} (requestId=${reqId})` : base });
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
      const normalized =
        typeof input === 'string'
          ? { message: input }
          : input ?? { message: '' };
      const userMessage = normalized.message ?? '';
      const userQuestion = normalized.question ?? '';
      if (!(userMessage.trim() || userQuestion.trim())) {
        return;
      }
      if (streamDebugEnabled) {
        streamDebugStateRef.current = { seq: 0, totalChars: 0, lastType: '', lastContent: '' };
        console.debug('[stream][start]', {
          projectId,
          refId: normalized.refId ?? refId,
          ref: normalized.ref ?? ref,
          provider: normalized.llmProvider ?? provider,
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
        refId: normalized.refId ?? refId,
        llmProvider: normalized.llmProvider ?? provider,
        ref: normalized.ref ?? ref,
        thinking: normalized.thinking ?? thinking,
        webSearch: normalized.webSearch ?? webSearch
      };
      const resolvedLeaseSessionId = normalized.leaseSessionId ?? leaseSessionId;
      const requestBody = resolvedLeaseSessionId ? { ...basePayload, leaseSessionId: resolvedLeaseSessionId } : basePayload;
      await sendStreamRequest({
        url: `/api/projects/${projectId}/chat`,
        body: requestBody
      });
    },
    [projectId, provider, ref, refId, thinking, webSearch, sendStreamRequest, streamDebugEnabled, leaseSessionId]
  );

  const interrupt = useCallback(async () => {
    if (activeRequest.current) {
      activeRequest.current.abort();
    }
    const interruptUrl = refId
      ? `/api/projects/${projectId}/interrupt?refId=${encodeURIComponent(refId)}`
      : ref
        ? `/api/projects/${projectId}/interrupt?ref=${encodeURIComponent(ref)}`
        : `/api/projects/${projectId}/interrupt`;
    await fetch(interruptUrl, { method: 'POST' });
  }, [projectId, ref, refId]);

  return {
    sendMessage,
    sendStreamRequest,
    interrupt,
    state
  };
}
