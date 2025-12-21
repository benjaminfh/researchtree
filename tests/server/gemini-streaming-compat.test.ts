import { describe, it, expect, vi } from 'vitest';

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
  it('falls back to non-streaming when streaming returns 405', async () => {
    process.env.GEMINI_MODEL = 'gemini-test';

    const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai');
    generateContentStream.mockRejectedValueOnce(new GoogleGenerativeAIFetchError('Method Not Allowed', 405, 'Method Not Allowed'));
    generateContent.mockResolvedValueOnce({
      response: {
        text: () => 'hello'
      }
    });

    const { streamAssistantCompletion } = await import('@/src/server/llm');
    const chunks: string[] = [];
    for await (const chunk of streamAssistantCompletion({
      provider: 'gemini',
      apiKey: 'user-key',
      messages: [{ role: 'user', content: 'hi' }]
    })) {
      chunks.push(chunk.content);
    }

    expect(chunks.join('')).toBe('hello');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

