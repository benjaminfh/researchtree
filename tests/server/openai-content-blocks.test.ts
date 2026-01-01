// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect } from 'vitest';
import { buildContentBlocksForProvider } from '@/src/server/llmContentBlocks';

describe('OpenAI content block reconstruction', () => {
  it('concatenates responses stream deltas into a single text block', () => {
    const rawEvents = [
      { type: 'response.output_text.delta', delta: 'Hello ' },
      { type: 'response.output_text.delta', text: 'world' }
    ];

    const blocks = buildContentBlocksForProvider({
      provider: 'openai_responses',
      rawResponse: rawEvents
    });

    expect(blocks).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('concatenates chat completion deltas including array content', () => {
    const rawEvents = [
      { choices: [{ delta: { content: 'Hello ' } }] },
      { choices: [{ delta: { content: [{ type: 'text', text: 'world' }] } }] }
    ];

    const blocks = buildContentBlocksForProvider({
      provider: 'openai',
      rawResponse: rawEvents
    });

    expect(blocks).toEqual([{ type: 'text', text: 'Hello world' }]);
  });
});
