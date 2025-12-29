import { useCallback, useRef, useState } from 'react';
import type { LLMProvider } from '@/src/server/llm';
import type { ThinkingSetting } from '@/src/shared/thinking';

const decoder = new TextDecoder();

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

interface UseChatStreamOptions {
  projectId: string;
  ref?: string;
  provider?: LLMProvider;
  thinking?: ThinkingSetting;
  webSearch?: boolean;
  onChunk?: (chunk: ChatStreamChunk) => void;
  onComplete?: () => void;
}

export function useChatStream({ projectId, ref, provider, thinking, webSearch, onChunk, onComplete }: UseChatStreamOptions) {
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

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) {
        return;
      }
      if (streamDebugEnabled) {
        streamDebugStateRef.current = { seq: 0, totalChars: 0, lastType: '', lastContent: '' };
        console.debug('[stream][start]', {
          projectId,
          ref,
          provider,
          thinking,
          webSearch,
          messageLength: message.length
        });
      }
      setState({ isStreaming: true, error: null });
      activeRequest.current = new AbortController();
      activeRequestId.current = null;
      try {
        const response = await fetch(`/api/projects/${projectId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, llmProvider: provider, ref, thinking, webSearch }),
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

        const reader = response.body.getReader();
        let buffer = '';
        let streamErrorMessage: string | null = null;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            if (line) {
              try {
                const parsed = JSON.parse(line) as ChatStreamChunk;
                if (parsed?.type === 'error' && typeof parsed.message === 'string') {
                  streamErrorMessage = parsed.message.trim() || 'Chat request failed';
                  setState({ isStreaming: false, error: streamErrorMessage });
                  await reader.cancel().catch(() => {});
                  break;
                }
                if (parsed && typeof parsed.content === 'string' && parsed.type !== 'error') {
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
              } catch {
                // ignore malformed lines
              }
            }
            if (streamErrorMessage) {
              break;
            }
            newlineIndex = buffer.indexOf('\n');
          }
          if (streamErrorMessage) {
            break;
          }
        }
        if (streamErrorMessage) {
          return;
        }
        const remaining = buffer.trim();
        if (remaining) {
          try {
            const parsed = JSON.parse(remaining) as ChatStreamChunk;
            if (parsed?.type === 'error' && typeof parsed.message === 'string') {
              streamErrorMessage = parsed.message.trim() || 'Chat request failed';
              setState({ isStreaming: false, error: streamErrorMessage });
              return;
            }
            if (parsed && typeof parsed.content === 'string' && parsed.type !== 'error') {
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
          } catch {
            // ignore trailing data
          }
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
    [projectId, provider, ref, thinking, webSearch, onChunk, onComplete]
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
    interrupt,
    state
  };
}
