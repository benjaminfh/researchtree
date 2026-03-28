import { describe, expect, it } from 'vitest';
import type { NodeRecord } from '@git/types';
import { buildChatExportPayload, EXPORT_CHAT_MAX_MESSAGES } from '@/src/components/workspace/chatExport';

const baseMessage = (overrides: Partial<NodeRecord> = {}): NodeRecord => ({
  id: 'm-1',
  type: 'message',
  role: 'user',
  content: 'hello',
  timestamp: Date.now(),
  parent: null,
  ...overrides
} as NodeRecord);

describe('buildChatExportPayload', () => {
  it('exports message nodes only and strips rawResponse from output', () => {
    const nodes: NodeRecord[] = [
      baseMessage({ id: 'm-user', role: 'user', content: 'Question' }),
      {
        id: 's-1',
        type: 'state',
        artefactSnapshot: 'draft',
        timestamp: Date.now(),
        parent: null
      },
      {
        id: 'merge-1',
        type: 'merge',
        mergeFrom: 'feature/x',
        mergeSummary: 'summary',
        sourceCommit: 'abc123',
        sourceNodeIds: [],
        timestamp: Date.now(),
        parent: null
      },
      baseMessage({ id: 'm-assistant', role: 'assistant', content: 'Answer', rawResponse: { hidden: true } as any })
    ];

    const result = buildChatExportPayload(nodes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] }
    ]);
    expect(result.payload).not.toContain('rawResponse');
  });

  it('includes thinking blocks in content when available', () => {
    const nodes: NodeRecord[] = [
      baseMessage({
        role: 'assistant',
        content: 'final answer',
        thinking: {
          provider: 'openai',
          availability: 'summary',
          content: [{ type: 'thinking', thinking: 'chain' }]
        }
      })
    ];

    const result = buildChatExportPayload(nodes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Array.isArray(result.messages[0]?.content)).toBe(true);
    expect(result.messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'chain' },
        { type: 'text', text: 'final answer' }
      ]
    });
  });

  it('fails when message count exceeds cap', () => {
    const nodes = Array.from({ length: EXPORT_CHAT_MAX_MESSAGES + 1 }, (_, idx) =>
      baseMessage({ id: `m-${idx}`, content: `msg-${idx}` })
    );

    const result = buildChatExportPayload(nodes);
    expect(result).toEqual({
      ok: false,
      reason: 'record_cap',
      messageCount: EXPORT_CHAT_MAX_MESSAGES + 1
    });
  });

  it('fails when serialized payload exceeds size cap', () => {
    const oversized = 'a'.repeat(1024 * 1024 + 512);
    const nodes: NodeRecord[] = [baseMessage({ content: oversized })];

    const result = buildChatExportPayload(nodes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('payload_cap');
    expect(result.bytes).toBeGreaterThan(1024 * 1024);
  });
});
