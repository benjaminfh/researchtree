import { describe, expect, it } from 'vitest';
import { buildContentBlocksForProvider } from '@/src/server/llmContentBlocks';

const makeEvent = (event: string, payload: unknown) => ({
  event,
  data: JSON.stringify(payload)
});

describe('Anthropic streaming reconstruction', () => {
  it('reconstructs thinking signatures from signature_delta events', () => {
    const rawEvents = [
      makeEvent('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' }
      }),
      makeEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me think' }
      }),
      makeEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'sig1' }
      }),
      makeEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
      makeEvent('content_block_start', {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' }
      }),
      makeEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'Hello' }
      }),
      makeEvent('content_block_stop', { type: 'content_block_stop', index: 1 })
    ];

    const blocks = buildContentBlocksForProvider({
      provider: 'anthropic',
      rawResponse: rawEvents
    });

    expect(blocks).toEqual([
      { type: 'thinking', thinking: 'Let me think', signature: 'sig1' },
      { type: 'text', text: 'Hello' }
    ]);
  });

  it('reconstructs tool_use input from input_json_delta', () => {
    const rawEvents = [
      makeEvent('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} }
      }),
      makeEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"location": "San' }
      }),
      makeEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: ' Francisco"}' }
      }),
      makeEvent('content_block_stop', { type: 'content_block_stop', index: 0 })
    ];

    const blocks = buildContentBlocksForProvider({
      provider: 'anthropic',
      rawResponse: rawEvents
    });

    expect(blocks).toMatchObject([
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'get_weather',
        input: { location: 'San Francisco' }
      }
    ]);
  });
});
