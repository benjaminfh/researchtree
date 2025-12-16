import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildChatContext } from '@/src/server/context';

const mocks = vi.hoisted(() => {
  return {
    getNodes: vi.fn(),
    getArtefact: vi.fn()
  };
});

vi.mock('@git/nodes', () => ({
  getNodes: mocks.getNodes
}));

vi.mock('@git/artefact', () => ({
  getArtefact: mocks.getArtefact
}));

describe('buildChatContext', () => {
  beforeEach(() => {
    mocks.getNodes.mockReset();
    mocks.getArtefact.mockReset();
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
});
