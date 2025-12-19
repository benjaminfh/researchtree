import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/chat/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  appendNodeToRefNoCheckout: vi.fn(),
  buildChatContext: vi.fn(),
  streamAssistantCompletion: vi.fn(),
  registerStream: vi.fn(),
  releaseStream: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  rtAppendNodeToRefShadowV1: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/nodes', () => ({
  appendNodeToRefNoCheckout: mocks.appendNodeToRefNoCheckout
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

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtAppendNodeToRefShadowV1: mocks.rtAppendNodeToRefShadowV1
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
    mocks.appendNodeToRefNoCheckout.mockResolvedValue(undefined);
    mocks.registerStream.mockImplementation(() => undefined);
    mocks.releaseStream.mockImplementation(() => undefined);
    process.env.RT_PG_SHADOW_WRITE = 'false';
  });

  it('streams assistant response and appends nodes', async () => {
    const appended: any[] = [];
    mocks.appendNodeToRefNoCheckout.mockImplementation(async (_projectId: string, _ref: string, node: any) => {
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

  it('shadow-writes user+assistant nodes when RT_PG_SHADOW_WRITE=true', async () => {
    process.env.RT_PG_SHADOW_WRITE = 'true';
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });

    mocks.appendNodeToRefNoCheckout.mockImplementation(async (_projectId: string, _ref: string, node: any) => {
      if (node.role === 'user') return { ...node, id: 'user-1' };
      return { ...node, id: 'asst-1' };
    });
    mocks.rtAppendNodeToRefShadowV1.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'user-1',
      ordinal: 0,
      artefactId: null,
      artefactContentHash: null
    });

    const res = await POST(createRequest({ message: 'Hi there', ref: 'main' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    await res.text();

    expect(mocks.rtAppendNodeToRefShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        refName: 'main',
        kind: 'message',
        role: 'user',
        nodeId: 'user-1',
        attachDraft: true
      })
    );
    expect(mocks.rtAppendNodeToRefShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        refName: 'main',
        kind: 'message',
        role: 'assistant',
        nodeId: 'asst-1',
        attachDraft: false
      })
    );
  });

  it('accepts ref and passes it through to context builder and stream registry', async () => {
    const appended: any[] = [];
    mocks.appendNodeToRefNoCheckout.mockImplementation(async (_projectId: string, _ref: string, node: any) => {
      appended.push(node);
      return node;
    });

    const response = await POST(createRequest({ message: 'Hi there', ref: 'feature/test' }), {
      params: { id: 'project-1' }
    });
    expect(response.status).toBe(200);
    await response.text();

    expect(mocks.buildChatContext).toHaveBeenCalledWith('project-1', expect.objectContaining({ ref: 'feature/test' }));
    expect(mocks.registerStream).toHaveBeenCalledWith('project-1', expect.any(AbortController), 'feature/test');
    expect(mocks.releaseStream).toHaveBeenCalledWith('project-1', 'feature/test');
    expect(appended[0]).toMatchObject({ role: 'user', content: 'Hi there' });
  });

  it('marks assistant node interrupted when aborted mid-stream', async () => {
    const appended: any[] = [];
    mocks.appendNodeToRefNoCheckout.mockImplementation(async (_projectId: string, _ref: string, node: any) => {
      appended.push(node);
      return node;
    });

    mocks.registerStream.mockImplementation((_projectId: string, controller: AbortController) => {
      setTimeout(() => controller.abort(), 0);
    });

    mocks.streamAssistantCompletion.mockImplementation(async function* ({ signal }: any) {
      yield { type: 'text', content: 'foo' };
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) {
        return;
      }
      yield { type: 'text', content: 'bar' };
    });

    const response = await POST(createRequest({ message: 'Hi there' }), { params: { id: 'project-1' } });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('foo');

    expect(appended[0]).toMatchObject({ role: 'user', content: 'Hi there' });
    expect(appended[1]).toMatchObject({ role: 'assistant', content: 'foo', interrupted: true });
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
