import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useChatStream } from '@/src/hooks/useChatStream';

const encoder = new TextEncoder();

const createTextStream = (chunks: string[]) => {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
};

const originalFetch = global.fetch;

describe('useChatStream', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('streams assistant chunks and invokes callbacks', async () => {
    const onChunk = vi.fn();
    const onComplete = vi.fn();

    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url.toString().includes('/chat')) {
        return Promise.resolve({
          ok: true,
          body: createTextStream([
            JSON.stringify({ type: 'text', content: 'foo' }) + '\n',
            JSON.stringify({ type: 'text', content: 'bar' }) + '\n'
          ])
        } as Response);
      }
      throw new Error('Unexpected fetch call');
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useChatStream({ projectId: 'p1', onChunk, onComplete }));

    await act(async () => {
      await result.current.sendMessage('Hello world');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello world', llmProvider: undefined })
      })
    );
    expect(onChunk).toHaveBeenNthCalledWith(1, { type: 'text', content: 'foo' });
    expect(onChunk).toHaveBeenNthCalledWith(2, { type: 'text', content: 'bar' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.state.isStreaming).toBe(false);
    expect(result.current.state.error).toBeNull();
  });

  it('includes the provider in the chat payload when specified', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url.toString().includes('/chat')) {
        return Promise.resolve({
          ok: true,
          body: createTextStream([JSON.stringify({ type: 'text', content: 'ok' }) + '\n'])
        } as Response);
      }
      throw new Error('Unexpected fetch call');
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook((options) => useChatStream(options), {
      initialProps: { projectId: 'p-provider', provider: 'gemini' as const }
    });

    await act(async () => {
      await result.current.sendMessage('Provider test');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p-provider/chat',
      expect.objectContaining({
        body: JSON.stringify({ message: 'Provider test', llmProvider: 'gemini', ref: undefined })
      })
    );
  });

  it('includes anthropic in the chat payload when specified', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (url.toString().includes('/chat')) {
        return Promise.resolve({
          ok: true,
          body: createTextStream([JSON.stringify({ type: 'text', content: 'ok' }) + '\n'])
        } as Response);
      }
      throw new Error('Unexpected fetch call');
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook((options) => useChatStream(options), {
      initialProps: { projectId: 'p-provider-anthropic', provider: 'anthropic' as any }
    });

    await act(async () => {
      await result.current.sendMessage('Provider test');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p-provider-anthropic/chat',
      expect.objectContaining({
        body: JSON.stringify({ message: 'Provider test', llmProvider: 'anthropic', ref: undefined })
      })
    );
  });

  it('passes ref through to chat and interrupt endpoints when provided', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/chat')) {
        return Promise.resolve({
          ok: true,
          body: createTextStream(['chunk'])
        } as Response);
      }
      if (urlStr.includes('/interrupt')) {
        return Promise.resolve({ ok: true } as Response);
      }
      throw new Error('Unexpected fetch call');
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useChatStream({ projectId: 'p-ref', ref: 'feature/foo' }));

    await act(async () => {
      await result.current.sendMessage('Hello ref');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p-ref/chat',
      expect.objectContaining({
        body: JSON.stringify({ message: 'Hello ref', llmProvider: undefined, ref: 'feature/foo' })
      })
    );

    await act(async () => {
      await result.current.interrupt();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p-ref/interrupt?ref=feature%2Ffoo',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sets an error state when the request fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        body: null
      } as Response)
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useChatStream({ projectId: 'p2' }));

    await act(async () => {
      await result.current.sendMessage('Hi');
    });

    expect(result.current.state.error).toBe('Chat request failed');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('surfaces API error message when present', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        body: null,
        json: async () => ({ error: { message: 'No API key configured for openai.' } })
      } as any as Response)
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useChatStream({ projectId: 'p4' }));

    await act(async () => {
      await result.current.sendMessage('Hi');
    });

    expect(result.current.state.error).toBe('No API key configured for openai.');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('aborts the active request when interrupt is invoked', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (url.toString().includes('/chat')) {
        const signal = init?.signal;
        return Promise.resolve({
          ok: true,
          body: {
            getReader() {
              return {
                read() {
                  return new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
                    const abortError = new Error('Aborted');
                    abortError.name = 'AbortError';
                    const handleAbort = () => {
                      signal?.removeEventListener('abort', handleAbort);
                      reject(abortError);
                    };
                    signal?.addEventListener('abort', handleAbort);
                  });
                }
              };
            }
          }
        } as Response);
      }
      if (url.toString().includes('/interrupt')) {
        return Promise.resolve({ ok: true } as Response);
      }
      throw new Error('Unexpected fetch call');
    });

    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useChatStream({ projectId: 'p3' }));

    let sendPromise: Promise<void>;
    await act(async () => {
      sendPromise = result.current.sendMessage('Long running');
    });

    expect(result.current.state.isStreaming).toBe(true);

    await act(async () => {
      await result.current.interrupt();
    });

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p3/interrupt',
      expect.objectContaining({ method: 'POST' })
    );

    await act(async () => {
      await sendPromise;
    });

    expect(result.current.state.isStreaming).toBe(false);
    expect(result.current.state.error).toBeNull();
  });

  it('does not send an empty message', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useChatStream({ projectId: 'p4' }));

    await act(async () => {
      await result.current.sendMessage('   ');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.isStreaming).toBe(false);
  });
});
