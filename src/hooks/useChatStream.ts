import { useCallback, useRef, useState } from 'react';
import type { LLMProvider } from '@/src/server/llm';
import type { ThinkingSetting } from '@/src/shared/thinking';

const decoder = new TextDecoder();

export interface ChatStreamState {
  isStreaming: boolean;
  error: string | null;
}

interface UseChatStreamOptions {
  projectId: string;
  ref?: string;
  provider?: LLMProvider;
  thinking?: ThinkingSetting;
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
}

export function useChatStream({ projectId, ref, provider, thinking, onChunk, onComplete }: UseChatStreamOptions) {
  const [state, setState] = useState<ChatStreamState>({ isStreaming: false, error: null });
  const activeRequest = useRef<AbortController | null>(null);
  const activeRequestId = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) {
        return;
      }
      setState({ isStreaming: true, error: null });
      activeRequest.current = new AbortController();
      activeRequestId.current = null;
      try {
        const response = await fetch(`/api/projects/${projectId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, llmProvider: provider, ref, thinking }),
          signal: activeRequest.current.signal
        });

        activeRequestId.current = response.headers.get('x-rt-request-id');

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
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          onChunk?.(chunk);
        }

        onComplete?.();
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
    [projectId, provider, ref, thinking, onChunk, onComplete]
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
