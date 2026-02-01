// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { streamAssistantCompletion } from '@/src/server/llm';

const mocks = vi.hoisted(() => ({
  createResponse: vi.fn()
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    responses = { create: mocks.createResponse };
  }
}));

describe('OpenAI Responses previous_response_id', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    mocks.createResponse.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it('passes previous_response_id to the Responses API when present', async () => {
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { type: 'response.completed', id: 'resp_new' };
      }
    };
    mocks.createResponse.mockResolvedValue(stream);

    const chunks = [];
    for await (const chunk of streamAssistantCompletion({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hello' }
      ],
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp_prev'
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(mocks.createResponse).toHaveBeenCalledTimes(1);
    expect(mocks.createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        previous_response_id: 'resp_prev'
      })
    );
  });
});
