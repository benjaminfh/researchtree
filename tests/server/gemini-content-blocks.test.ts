// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, expect, it } from 'vitest';
import { buildContentBlocksForProvider } from '@/src/server/llmContentBlocks';

const makeChunk = (parts: Array<{ text?: string; thought?: unknown; thoughtSignature?: string }>) => ({
  candidates: [
    {
      content: {
        parts
      }
    }
  ]
});

describe('Gemini content block reconstruction', () => {
  it('prefers stream thought markers when response omits them', () => {
    const rawResponse = {
      stream: [
        makeChunk([{ text: 'think1', thought: true }]),
        makeChunk([{ text: 'Hello' }]),
        makeChunk([{ text: '', thoughtSignature: 'sig-123' }])
      ],
      response: makeChunk([{ text: 'think1' }, { text: 'Hello' }])
    };

    const blocks = buildContentBlocksForProvider({
      provider: 'gemini',
      rawResponse
    });

    expect(blocks).toEqual([
      { type: 'thinking', thinking: 'think1' },
      { type: 'text', text: 'Hello' },
      { type: 'thinking_signature', signature: 'sig-123' }
    ]);
  });
});
