import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildChatContext } from '@/src/server/context';

const mocks = vi.hoisted(() => {
  return {
    getNodes: vi.fn(),
    getArtefact: vi.fn(),
    getArtefactFromRef: vi.fn(),
    readNodesFromRef: vi.fn(),
    rtGetHistoryShadowV1: vi.fn(),
    rtGetCanvasShadowV1: vi.fn()
  };
});

vi.mock('@git/nodes', () => ({
  getNodes: mocks.getNodes
}));

vi.mock('@git/artefact', () => ({
  getArtefact: mocks.getArtefact,
  getArtefactFromRef: mocks.getArtefactFromRef
}));

vi.mock('@git/utils', () => ({
  readNodesFromRef: mocks.readNodesFromRef
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetHistoryShadowV1: mocks.rtGetHistoryShadowV1,
  rtGetCanvasShadowV1: mocks.rtGetCanvasShadowV1
}));

describe('buildChatContext', () => {
  beforeEach(() => {
    mocks.getNodes.mockReset();
    mocks.getArtefact.mockReset();
    mocks.getArtefactFromRef.mockReset();
    mocks.readNodesFromRef.mockReset();
    mocks.rtGetHistoryShadowV1.mockReset();
    mocks.rtGetCanvasShadowV1.mockReset();
    process.env.RT_STORE = 'git';
  });

  it('includes artefact snapshot and recent messages', async () => {
    mocks.getNodes.mockResolvedValue([
      {
        id: '1',
        type: 'message',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
        parent: null
      }
    ]);
    mocks.getArtefact.mockResolvedValue('# Artefact v1');

    const context = await buildChatContext('project-1');

    expect(context.messages[0].role).toBe('system');
    expect(context.messages[0].content).toContain('Artefact v1');
    expect(context.messages.some((msg) => msg.content.includes('Hello'))).toBe(true);
  });

  it('respects provided token limit', async () => {
    const makeNode = (idx: number) => ({
      id: `${idx}`,
      type: 'message',
      role: 'user',
      content: 'x'.repeat(200),
      timestamp: Date.now(),
      parent: null
    });

    mocks.getNodes.mockResolvedValue([makeNode(1), makeNode(2), makeNode(3)]);
    mocks.getArtefact.mockResolvedValue('Artefact');

    const context = await buildChatContext('project-1', { tokenLimit: 100 });

    // Only a subset of nodes should be included once budget is exhausted
    expect(context.messages.filter((msg) => msg.role === 'user').length).toBeLessThan(3);
  });

  it('includes merge summary and merged assistant payload', async () => {
    mocks.getNodes.mockResolvedValue([
      {
        id: 'a',
        type: 'message',
        role: 'user',
        content: 'Hi',
        timestamp: Date.now(),
        parent: null
      },
      {
        id: 'm',
        type: 'merge',
        mergeFrom: 'feature',
        mergeSummary: 'Bring back final answer',
        sourceCommit: 'abc',
        sourceNodeIds: ['x'],
        mergedAssistantNodeId: 'x',
        mergedAssistantContent: 'Final payload text',
        canvasDiff: '+diff text',
        timestamp: Date.now(),
        parent: 'a'
      }
    ]);
    mocks.getArtefact.mockResolvedValue('Artefact');

    const context = await buildChatContext('project-1');

    expect(context.messages.some((msg) => msg.role === 'system' && msg.content.includes('Merge summary from feature'))).toBe(true);
    expect(context.messages.some((msg) => msg.role === 'assistant' && msg.content.includes('Final payload text'))).toBe(true);
    expect(context.messages.some((msg) => msg.content.includes('+diff text'))).toBe(false);
  });

  it('includes pinned canvas diffs only when they are persisted as assistant messages', async () => {
    mocks.getNodes.mockResolvedValue([
      {
        id: 'a',
        type: 'message',
        role: 'user',
        content: 'Hi',
        timestamp: Date.now(),
        parent: null
      },
      {
        id: 'p1',
        type: 'message',
        role: 'assistant',
        content: '+diff text',
        pinnedFromMergeId: 'm',
        timestamp: Date.now(),
        parent: 'a'
      }
    ]);
    mocks.getArtefact.mockResolvedValue('Artefact');

    const context = await buildChatContext('project-1');
    expect(context.messages.some((msg) => msg.role === 'assistant' && msg.content.includes('+diff text'))).toBe(true);
  });

  it('reads nodes + canvas from Postgres when RT_STORE=pg and ref is provided', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetHistoryShadowV1.mockResolvedValue([
      { ordinal: 0, nodeJson: { id: '1', type: 'message', role: 'user', content: 'Hello', timestamp: 1, parent: null } }
    ]);
    mocks.rtGetCanvasShadowV1.mockResolvedValue({ content: 'Canvas PG', contentHash: 'x', updatedAt: null, source: 'draft' });

    const context = await buildChatContext('project-1', { ref: 'main' });
    expect(mocks.rtGetHistoryShadowV1).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', refName: 'main' }));
    expect(mocks.rtGetCanvasShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', refName: 'main' });
    expect(context.messages[0].content).toContain('Canvas PG');
    expect(context.messages.some((m) => m.role === 'user' && m.content === 'Hello')).toBe(true);
  });

  it('throws when Postgres context read fails in RT_STORE=pg mode', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetHistoryShadowV1.mockRejectedValue(new Error('pg down'));
    await expect(buildChatContext('project-1', { ref: 'main' })).rejects.toThrow('pg down');
    expect(mocks.readNodesFromRef).not.toHaveBeenCalled();
  });
});
