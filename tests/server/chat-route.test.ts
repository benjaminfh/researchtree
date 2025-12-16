import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/chat/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  appendNode: vi.fn(),
  buildChatContext: vi.fn(),
  streamAssistantCompletion: vi.fn(),
  registerStream: vi.fn(),
  releaseStream: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/nodes', () => ({
  appendNode: mocks.appendNode
}));

vi.mock('@/src/server/context', () => ({
  buildChatContext: mocks.buildChatContext
}));

vi.mock('@/src/server/llm', () => {
  const encoder = new TextEncoder();
  return {
    streamAssistantCompletion: mocks.streamAssistantCompletion,
    encodeChunk: (content: string) => encoder.encode(content),
    resolveLLMProvider: vi.fn(() => 'mock')
  };
});

vi.mock('@/src/server/stream-registry', () => ({
  registerStream: mocks.registerStream,
  releaseStream: mocks.releaseStream
}));

vi.mock('@/src/server/providerCapabilities', () => ({
  getProviderTokenLimit: vi.fn(async () => 4000)
}));

const baseUrl = 'http://localhost/api/projects/project-1/chat';

function createRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/chat', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.buildChatContext.mockResolvedValue({
      systemPrompt: 'system',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'Hello' }
      ]
    });
    mocks.streamAssistantCompletion.mockImplementation(async function* () {
      yield { type: 'text', content: 'foo' };
      yield { type: 'text', content: 'bar' };
    });
    mocks.appendNode.mockResolvedValue(undefined);
  });

  it('streams assistant response and appends nodes', async () => {
    const appended: any[] = [];
    mocks.appendNode.mockImplementation(async (_projectId: string, node: any) => {
      appended.push(node);
      return node;
    });

    const response = await POST(createRequest({ message: 'Hi there' }), { params: { id: 'project-1' } });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('foobar');

    expect(appended[0]).toMatchObject({ role: 'user', content: 'Hi there' });
    expect(appended[1]).toMatchObject({ role: 'assistant', content: 'foobar', interrupted: false });
  });

  it('returns 400 for invalid body', async () => {
    const res = await POST(createRequest({ message: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('propagates errors from context builder', async () => {
    mocks.buildChatContext.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(createRequest({ message: 'Hi' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(500);
  });
});
