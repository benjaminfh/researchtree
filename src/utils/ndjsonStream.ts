// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export interface NdjsonStreamResult {
  errorMessage: string | null;
}

interface NdjsonStreamOptions<T> {
  onFrame?: (frame: T) => void | Promise<void>;
  onError?: (message: string) => void | Promise<void>;
  defaultErrorMessage?: string;
}

export async function consumeNdjsonStream<T extends { type?: string; message?: string }>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: NdjsonStreamOptions<T> = {}
): Promise<NdjsonStreamResult> {
  const decoder = new TextDecoder();
  let buffer = '';
  let errorMessage: string | null = null;

  const handleFrame = async (frame: T) => {
    if (frame?.type === 'error') {
      const message =
        typeof frame.message === 'string' && frame.message.trim()
          ? frame.message.trim()
          : options.defaultErrorMessage ?? 'Request failed';
      errorMessage = message;
      await options.onError?.(message);
      return false;
    }
    await options.onFrame?.(frame);
    return true;
  };

  const handleLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    try {
      const parsed = JSON.parse(trimmed) as T;
      return await handleFrame(parsed);
    } catch {
      return true;
    }
  };

  const handleLines = async (lines: string[]) => {
    for (const line of lines) {
      const ok = await handleLine(line);
      if (!ok) {
        return false;
      }
    }
    return true;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    const ok = await handleLines(lines);
    if (!ok) {
      await reader.cancel().catch(() => {});
      return { errorMessage };
    }
  }

  const finalText = buffer + decoder.decode();
  if (finalText) {
    const lines = finalText.split('\n');
    const ok = await handleLines(lines);
    if (!ok) {
      return { errorMessage };
    }
  }

  return { errorMessage };
}
