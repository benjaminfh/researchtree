// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/projects/[id]/branch-question/route';

const mocks = vi.hoisted(() => ({
  rtGetCurrentRefShadowV2: vi.fn(),
  rtSetCurrentRefShadowV2: vi.fn(),
  rtCreateRefFromNodeShadowV2: vi.fn(),
  rtCreateRefFromRefShadowV2: vi.fn(),
  rtGetNodeContentShadowV1: vi.fn(),
  rtListRefsShadowV2: vi.fn(),
  getProject: vi.fn(),
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  readNodesFromRef: vi.fn(),
  getCommitHashForNode: vi.fn(),
  chatPost: vi.fn()
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtGetCurrentRefShadowV2: mocks.rtGetCurrentRefShadowV2,
  rtSetCurrentRefShadowV2: mocks.rtSetCurrentRefShadowV2
}));

vi.mock('@/src/store/pg/branches', () => ({
  rtCreateRefFromNodeShadowV2: mocks.rtCreateRefFromNodeShadowV2,
  rtCreateRefFromRefShadowV2: mocks.rtCreateRefFromRefShadowV2
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtGetNodeContentShadowV1: mocks.rtGetNodeContentShadowV1
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV2: mocks.rtListRefsShadowV2
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/branches', () => ({
  listBranches: mocks.listBranches,
  createBranch: mocks.createBranch,
  switchBranch: mocks.switchBranch
}));

vi.mock('@git/utils', () => ({
  readNodesFromRef: mocks.readNodesFromRef,
  getCommitHashForNode: mocks.getCommitHashForNode
}));

vi.mock('@/app/api/projects/[id]/chat/route', () => ({
  POST: mocks.chatPost
}));

const baseUrl = 'http://localhost/api/projects/project-1/branch-question';

function createRequest(body: Record<string, unknown>) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/branch-question', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.chatPost.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    process.env.RT_STORE = 'git';
  });

  it('returns 400 when missing highlight or fromNodeId', async () => {
    const res = await POST(
      createRequest({
        name: 'question',
        question: 'why'
      }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.error.message).toBe('Invalid request body');
    expect(payload.error.code).toBe('BAD_REQUEST');
  });

  it('uses the assistant responseId for PG question branches on openai_responses', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-main', refName: 'main' });
    mocks.rtListRefsShadowV2
      .mockResolvedValueOnce([{ id: 'ref-main', name: 'main', provider: 'openai_responses', model: 'gpt-5.2' }])
      .mockResolvedValueOnce([
        { id: 'ref-main', name: 'main', provider: 'openai_responses', model: 'gpt-5.2' },
        { id: 'ref-new', name: 'question', provider: 'openai_responses', model: 'gpt-5.2' }
      ]);
    mocks.rtGetNodeContentShadowV1.mockResolvedValue({
      id: 'node-1',
      type: 'message',
      role: 'assistant',
      responseId: 'resp-node'
    });
    mocks.rtCreateRefFromNodeShadowV2.mockResolvedValue({ baseCommitId: 'a', baseOrdinal: 1 });

    const res = await POST(
      createRequest({
        name: 'question',
        fromNodeId: 'node-1',
        question: 'why',
        highlight: 'highlight',
        switch: false
      }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(200);
    expect(mocks.rtCreateRefFromNodeShadowV2).toHaveBeenCalledWith({
      projectId: 'project-1',
      newRefName: 'question',
      sourceRefId: 'ref-main',
      nodeId: 'node-1',
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp-node'
    });
  });

  it('clears previousResponseId for PG question branches when switching providers', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-main', refName: 'main' });
    mocks.rtListRefsShadowV2
      .mockResolvedValueOnce([{ id: 'ref-main', name: 'main', provider: 'openai_responses', model: 'gpt-5.2' }])
      .mockResolvedValueOnce([
        { id: 'ref-main', name: 'main', provider: 'openai_responses', model: 'gpt-5.2' },
        { id: 'ref-new', name: 'question', provider: 'gemini', model: 'gemini-pro' }
      ]);
    mocks.rtGetNodeContentShadowV1.mockResolvedValue({
      id: 'node-1',
      type: 'message',
      role: 'assistant',
      responseId: 'resp-node'
    });
    mocks.rtCreateRefFromNodeShadowV2.mockResolvedValue({ baseCommitId: 'a', baseOrdinal: 1 });

    const res = await POST(
      createRequest({
        name: 'question',
        fromNodeId: 'node-1',
        provider: 'gemini',
        model: 'gemini-3-pro-preview',
        question: 'why',
        highlight: 'highlight',
        switch: false
      }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(200);
    expect(mocks.rtCreateRefFromNodeShadowV2).toHaveBeenCalledWith({
      projectId: 'project-1',
      newRefName: 'question',
      sourceRefId: 'ref-main',
      nodeId: 'node-1',
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
      previousResponseId: null
    });
  });

  it('uses the assistant responseId for git question branches on openai_responses', async () => {
    process.env.RT_STORE = 'git';
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true, provider: 'openai_responses', model: 'gpt-5.2' }
    ]);
    mocks.readNodesFromRef.mockResolvedValue([
      { id: 'node-1', type: 'message', role: 'assistant', responseId: 'resp-node' }
    ]);
    mocks.getCommitHashForNode.mockResolvedValue('commit-1');

    const res = await POST(
      createRequest({
        name: 'question',
        fromRef: 'main',
        fromNodeId: 'node-1',
        question: 'why',
        highlight: 'highlight',
        switch: false
      }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(200);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'question', 'commit-1', {
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp-node'
    });
  });
});
