import { useCallback, useRef, useState } from 'react';
import type { LLMProvider } from '@/src/server/llm';

const decoder = new TextDecoder();

export interface ChatStreamState {
  isStreaming: boolean;
  error: string | null;
}

interface UseChatStreamOptions {
  projectId: string;
  provider?: LLMProvider;
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
}

export function useChatStream({ projectId, provider, onChunk, onComplete }: UseChatStreamOptions) {
  const [state, setState] = useState<ChatStreamState>({ isStreaming: false, error: null });
  const activeRequest = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) {
        return;
      }
      setState({ isStreaming: true, error: null });
      activeRequest.current = new AbortController();
      try {
        const response = await fetch(`/api/projects/${projectId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, llmProvider: provider }),
          signal: activeRequest.current.signal
        });

        if (!response.ok || !response.body) {
          throw new Error('Chat request failed');
        }

        const reader = response.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          onChunk?.(chunk);
        }

        onComplete?.();
        setState({ isStreaming: false, error: null });
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
          setState({ isStreaming: false, error: null });
        } else {
          console.error('[useChatStream] error', error);
          setState({ isStreaming: false, error: 'Unable to send message' });
        }
      } finally {
        activeRequest.current = null;
      }
    },
    [projectId, provider, onChunk, onComplete]
  );

  const interrupt = useCallback(async () => {
    if (activeRequest.current) {
      activeRequest.current.abort();
    }
    await fetch(`/api/projects/${projectId}/interrupt`, { method: 'POST' });
  }, [projectId]);

  return {
    sendMessage,
    interrupt,
    state
  };
}
