// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/chat/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  appendNodeToRefNoCheckout: vi.fn(),
  buildChatContext: vi.fn(),
  streamAssistantCompletion: vi.fn(),
  registerStream: vi.fn(),
  releaseStream: vi.fn(),
  rtAppendNodeToRefShadowV2: vi.fn(),
  rtGetHistoryShadowV2: vi.fn(),
  rtGetCurrentRefShadowV2: vi.fn(),
  getBranchConfigMap: vi.fn(),
  rtGetCanvasHashesShadowV2: vi.fn(),
  rtGetCanvasPairShadowV2: vi.fn(),
  resolveRefByName: vi.fn(),
  resolveCurrentRef: vi.fn()
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
    resolveLLMProvider: vi.fn(() => 'mock'),
    getDefaultModelForProvider: vi.fn(() => 'mock')
  };
});

vi.mock('@/src/server/branchConfig', () => ({
  getBranchConfigMap: mocks.getBranchConfigMap,
  resolveBranchConfig: () => ({ provider: 'openai', model: 'gpt-5.2' })
}));

vi.mock('@/src/server/stream-registry', () => ({
  registerStream: mocks.registerStream,
  releaseStream: mocks.releaseStream
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtAppendNodeToRefShadowV2: mocks.rtAppendNodeToRefShadowV2
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetHistoryShadowV2: mocks.rtGetHistoryShadowV2,
  rtGetCanvasHashesShadowV2: mocks.rtGetCanvasHashesShadowV2,
  rtGetCanvasPairShadowV2: mocks.rtGetCanvasPairShadowV2
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtGetCurrentRefShadowV2: mocks.rtGetCurrentRefShadowV2
}));

vi.mock('@/src/server/pgRefs', () => ({
  resolveRefByName: mocks.resolveRefByName,
  resolveCurrentRef: mocks.resolveCurrentRef
}));

vi.mock('@/src/server/providerCapabilities', () => ({
  getProviderTokenLimit: vi.fn(async () => 4000)
}));

vi.mock('@/src/server/llmUserKeys', () => ({
  requireUserApiKeyForProvider: vi.fn(async () => null)
}));

const baseUrl = 'http://localhost/api/projects/project-1/chat';

function createRequest(body: Record<string, unknown>) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseSessionId: 'lease-session', ...body })
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
    mocks.rtGetHistoryShadowV2.mockResolvedValue([]);
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-1', refName: 'main' });
    mocks.getBranchConfigMap.mockResolvedValue({ main: { provider: 'openai', model: 'gpt-5.2' } });
    mocks.rtGetCanvasHashesShadowV2.mockResolvedValue({ draftHash: null, artefactHash: null });
    mocks.rtGetCanvasPairShadowV2.mockResolvedValue({
      draftContent: '',
      draftHash: null,
      artefactContent: '',
      artefactHash: null,
      draftUpdatedAt: null,
      artefactUpdatedAt: null
    });
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-1', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-1', name: 'main' });
    process.env.RT_STORE = 'git';
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
    const lines = text.trim().split('\n').filter(Boolean);
    const chunks = lines.map((line) => JSON.parse(line));
    expect(chunks).toEqual([
      { type: 'text', content: 'foo' },
      { type: 'text', content: 'bar' }
    ]);

    expect(appended[0]).toMatchObject({ role: 'user', content: 'Hi there' });
    expect(appended[1]).toMatchObject({ role: 'assistant', content: 'foobar', interrupted: false });
  });

  it('uses Postgres for user+assistant nodes when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCanvasHashesShadowV2
      .mockResolvedValueOnce({ draftHash: 'draft-1', artefactHash: 'artefact-0' })
      .mockResolvedValueOnce({ draftHash: 'draft-1', artefactHash: 'draft-1' });
    mocks.rtGetCanvasPairShadowV2.mockResolvedValue({
      draftContent: 'Canvas v2',
      draftHash: 'draft-1',
      artefactContent: 'Canvas v1',
      artefactHash: 'artefact-0',
      draftUpdatedAt: null,
      artefactUpdatedAt: null
    });
    mocks.rtAppendNodeToRefShadowV2.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'user-1',
      ordinal: 0,
      artefactId: null,
      artefactContentHash: null
    });

    const res = await POST(createRequest({ message: 'Hi there', ref: 'main' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    await res.text();

    expect(mocks.rtAppendNodeToRefShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        refId: 'ref-1',
        kind: 'message',
        role: 'user',
        attachDraft: true
      })
    );
    expect(mocks.rtAppendNodeToRefShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        refId: 'ref-1',
        kind: 'message',
        role: 'assistant',
        attachDraft: false
      })
    );
    expect(mocks.appendNodeToRefNoCheckout).not.toHaveBeenCalled();
    expect(mocks.getProject).not.toHaveBeenCalled();
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
    const lines = text.trim().split('\n').filter(Boolean);
    const chunks = lines.map((line) => JSON.parse(line));
    expect(chunks).toEqual([{ type: 'text', content: 'foo' }]);

    expect(appended[0]).toMatchObject({ role: 'user', content: 'Hi there' });
    expect(appended[1]).toMatchObject({ role: 'assistant', content: 'foo', interrupted: true });
  });

  it('returns 400 for invalid body', async () => {
    const res = await POST(createRequest({ message: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('does not append empty assistant node and errors the stream', async () => {
    const appended: any[] = [];
    mocks.appendNodeToRefNoCheckout.mockImplementation(async (_projectId: string, _ref: string, node: any) => {
      appended.push(node);
      return node;
    });

    mocks.streamAssistantCompletion.mockImplementation(async function* () {
      // yield nothing
    });

    const response = await POST(createRequest({ message: 'Hi there' }), { params: { id: 'project-1' } });
    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text.trim().split('\n').filter(Boolean);
    const chunks = lines.map((line) => JSON.parse(line));
    expect(chunks).toEqual([{ type: 'error', message: 'LLM returned empty response' }]);

    expect(appended).toHaveLength(0);
  });

  it('skips empty assistant node in Postgres mode', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtAppendNodeToRefShadowV2.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'user-1',
      ordinal: 0,
      artefactId: null,
      artefactContentHash: null
    });

    mocks.streamAssistantCompletion.mockImplementation(async function* () {
      // yield nothing
    });

    const res = await POST(createRequest({ message: 'Hi there', ref: 'main' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.trim().split('\n').filter(Boolean);
    const chunks = lines.map((line) => JSON.parse(line));
    expect(chunks).toEqual([{ type: 'error', message: 'LLM returned empty response' }]);

    expect(mocks.rtAppendNodeToRefShadowV2).not.toHaveBeenCalled();
  });

  it('propagates errors from context builder', async () => {
    mocks.buildChatContext.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(createRequest({ message: 'Hi' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(500);
  });
});
