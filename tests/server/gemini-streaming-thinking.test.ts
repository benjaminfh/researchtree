// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentStream = vi.fn();

vi.mock('@google/generative-ai', async () => {
  class GoogleGenerativeAIError extends Error {}
  class GoogleGenerativeAIFetchError extends GoogleGenerativeAIError {}
  class GoogleGenerativeAIResponseError<T> extends GoogleGenerativeAIError {
    response?: T;
    constructor(message: string, response?: T) {
      super(message);
      this.response = response;
    }
  }

  class GoogleGenerativeAI {
    constructor() {}
    getGenerativeModel() {
      return {
        generateContentStream
      };
    }
  }

  return {
    GoogleGenerativeAI,
    GoogleGenerativeAIError,
    GoogleGenerativeAIFetchError,
    GoogleGenerativeAIResponseError
  };
});

type GeminiPart = { text?: string; thought?: unknown; thoughtSignature?: string };

const makeChunk = (parts: GeminiPart[], textSpy?: () => string) => ({
  candidates: [
    {
      content: {
        parts
      }
    }
  ],
  text: textSpy
});

describe('Gemini streaming thinking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_MODEL;
  });

  it('streams thought content separately from text and emits signature', async () => {
    const chunkTextSpy = vi.fn(() => 'should-not-use');
    const chunkTextSpy2 = vi.fn(() => 'should-not-use');
    const responseTextSpy = vi.fn(() => 'should-not-use');

    const chunks = [
      makeChunk(
        [
          { thought: true, text: 'think1 ' },
          { text: 'Answer' }
        ],
        chunkTextSpy
      ),
      makeChunk(
        [
          { thought: true, text: 'think1 think2' },
          { text: 'Answer more' },
          { thoughtSignature: 'sig-123' }
        ],
        chunkTextSpy2
      )
    ];

    const response = makeChunk([
      { thought: true, text: 'think1 think2' },
      { text: 'Answer more' },
      { thoughtSignature: 'sig-123' }
    ], responseTextSpy);

    generateContentStream.mockResolvedValueOnce({
      stream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      response: Promise.resolve(response)
    });

    const { streamAssistantCompletion } = await import('@/src/server/llm');
    const output: Array<{ type: string; content?: string; append?: boolean }> = [];
    for await (const chunk of streamAssistantCompletion({
      provider: 'gemini',
      apiKey: 'user-key',
      thinking: 'low',
      messages: [{ role: 'user', content: 'hi' }]
    })) {
      output.push({ type: chunk.type, content: chunk.content, append: chunk.append });
    }

    const trimmed = output.filter((chunk) => chunk.type !== 'raw_response');

    expect(trimmed).toEqual([
      { type: 'thinking', content: 'think1 ', append: true },
      { type: 'text', content: 'Answer', append: undefined },
      { type: 'thinking', content: 'think2', append: true },
      { type: 'thinking_signature', content: 'sig-123', append: false },
      { type: 'text', content: ' more', append: undefined }
    ]);

    expect(chunkTextSpy).not.toHaveBeenCalled();
    expect(chunkTextSpy2).not.toHaveBeenCalled();
    expect(responseTextSpy).not.toHaveBeenCalled();
  });

  it('treats truthy thought markers as thinking', async () => {
    const chunkTextSpy = vi.fn(() => 'should-not-use');
    const responseTextSpy = vi.fn(() => 'should-not-use');

    const chunks = [makeChunk([{ thought: 'true', text: 'think' }, { text: 'Answer' }], chunkTextSpy)];
    const response = makeChunk([{ thought: 'true', text: 'think' }, { text: 'Answer' }], responseTextSpy);

    generateContentStream.mockResolvedValueOnce({
      stream: (async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      })(),
      response: Promise.resolve(response)
    });

    const { streamAssistantCompletion } = await import('@/src/server/llm');
    const output: Array<{ type: string; content?: string; append?: boolean }> = [];
    for await (const chunk of streamAssistantCompletion({
      provider: 'gemini',
      apiKey: 'user-key',
      thinking: 'low',
      messages: [{ role: 'user', content: 'hi' }]
    })) {
      output.push({ type: chunk.type, content: chunk.content, append: chunk.append });
    }

    const trimmed = output.filter((chunk) => chunk.type !== 'raw_response');

    expect(trimmed).toEqual([
      { type: 'thinking', content: 'think', append: true },
      { type: 'text', content: 'Answer', append: undefined }
    ]);

    expect(chunkTextSpy).not.toHaveBeenCalled();
    expect(responseTextSpy).not.toHaveBeenCalled();
  });
});
