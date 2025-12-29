// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { beforeEach, describe, it, expect, vi } from 'vitest';

const generateContentStream = vi.fn();
const generateContent = vi.fn();

vi.mock('@google/generative-ai', async () => {
  class GoogleGenerativeAIError extends Error {}
  class GoogleGenerativeAIFetchError extends GoogleGenerativeAIError {
    status?: number;
    statusText?: string;
    constructor(message: string, status?: number, statusText?: string) {
      super(message);
      this.status = status;
      this.statusText = statusText;
    }
  }
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
        generateContentStream,
        generateContent
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

describe('Gemini streaming compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GEMINI_MODEL;
  });

  it('throws when streaming returns 405', async () => {
    process.env.GEMINI_MODEL = 'gemini-3-pro-preview';

    const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai');
    generateContentStream.mockRejectedValueOnce(new GoogleGenerativeAIFetchError('Method Not Allowed', 405, 'Method Not Allowed'));

    const { streamAssistantCompletion } = await import('@/src/server/llm');
    const iter = streamAssistantCompletion({
      provider: 'gemini',
      apiKey: 'user-key',
      messages: [{ role: 'user', content: 'hi' }]
    });

    await expect(iter.next()).rejects.toThrow(/does not support streaming/i);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('throws when gemini-3-pro-preview is asked for medium thinking', async () => {
    process.env.GEMINI_MODEL = 'gemini-3-pro-preview';

    const { streamAssistantCompletion } = await import('@/src/server/llm');
    const iter = streamAssistantCompletion({
      provider: 'gemini',
      apiKey: 'user-key',
      thinking: 'medium',
      messages: [{ role: 'user', content: 'hi' }]
    });

    await expect(iter.next()).rejects.toThrow(/does not support thinking:\s*medium/i);
    expect(generateContentStream).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });
});
