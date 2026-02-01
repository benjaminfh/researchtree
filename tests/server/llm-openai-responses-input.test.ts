// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { buildOpenAIResponsesInput } from '@/src/server/llm';

describe('buildOpenAIResponsesInput', () => {
  const baseMessages = [
    { role: 'system' as const, content: 'sys' },
    { role: 'user' as const, content: 'u1' },
    { role: 'assistant' as const, content: 'a1' },
    { role: 'user' as const, content: 'u2' }
  ];

  it('replays full history when previousResponseId is absent', () => {
    const { instructions, input } = buildOpenAIResponsesInput(baseMessages, { previousResponseId: null });
    expect(instructions).toBe('sys');
    expect(input).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'u1' }] },
      { role: 'assistant', content: [{ type: 'input_text', text: 'a1' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'u2' }] }
    ]);
  });

  it('sends only the last user message when previousResponseId is present', () => {
    const { instructions, input } = buildOpenAIResponsesInput(baseMessages, { previousResponseId: 'resp_123' });
    expect(instructions).toBe('sys');
    expect(input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'u2' }] }]);
  });
});
