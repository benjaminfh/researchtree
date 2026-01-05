// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/projects/[id]/branches/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  getCurrentBranchName: vi.fn(),
  readNodesFromRef: vi.fn(),
  getCommitHashForNode: vi.fn(),
  rtGetCurrentRefShadowV2: vi.fn(),
  rtSetCurrentRefShadowV2: vi.fn(),
  rtListRefsShadowV2: vi.fn(),
  rtCreateRefFromRefShadowV2: vi.fn(),
  rtCreateRefFromNodeShadowV2: vi.fn(),
  getPreviousResponseId: vi.fn(),
  rtGetNodeContentShadowV1: vi.fn()
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
  getCurrentBranchName: mocks.getCurrentBranchName,
  readNodesFromRef: mocks.readNodesFromRef,
  getCommitHashForNode: mocks.getCommitHashForNode
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtGetCurrentRefShadowV2: mocks.rtGetCurrentRefShadowV2,
  rtSetCurrentRefShadowV2: mocks.rtSetCurrentRefShadowV2
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV2: mocks.rtListRefsShadowV2
}));

vi.mock('@/src/store/pg/branches', () => ({
  rtCreateRefFromRefShadowV2: mocks.rtCreateRefFromRefShadowV2,
  rtCreateRefFromNodeShadowV2: mocks.rtCreateRefFromNodeShadowV2
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtGetNodeContentShadowV1: mocks.rtGetNodeContentShadowV1
}));

vi.mock('@/src/server/llmState', () => ({
  getPreviousResponseId: mocks.getPreviousResponseId
}));

const baseUrl = 'http://localhost/api/projects/project-1/branches';

function createRequest(body: unknown, method: 'POST' | 'PATCH') {
  return new Request(baseUrl, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/branches', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.listBranches.mockResolvedValue([{ name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true }]);
    mocks.getCurrentBranchName.mockResolvedValue('main');
    mocks.getPreviousResponseId.mockResolvedValue('resp-123');
    process.env.RT_STORE = 'git';
  });

  it('lists branches', async () => {
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.branches).toHaveLength(1);
    expect(json.currentBranch).toBe('main');
  });

  it('reads branches from Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtListRefsShadowV2.mockResolvedValue([
      { id: 'ref-main', name: 'main', headCommit: '', nodeCount: 2, isTrunk: true },
      { id: 'ref-feature', name: 'feature', headCommit: '', nodeCount: 0, isTrunk: false }
    ]);
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-main', refName: 'main' });

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(mocks.rtListRefsShadowV2).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(json.branches).toHaveLength(2);
  });

  it('creates branch', async () => {
    const res = await POST(createRequest({ name: 'feature', fromRef: 'main' }, 'POST'), { params: { id: 'project-1' } });
    expect(res.status).toBe(201);
    expect(mocks.getPreviousResponseId).toHaveBeenCalledWith('project-1', { id: null, name: 'main' });
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'feature', 'main', {
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp-123'
    });
  });

  it('creates branch via Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-main', refName: 'main' });
    mocks.rtListRefsShadowV2.mockResolvedValue([
      { id: 'ref-main', name: 'main', headCommit: 'a', nodeCount: 2, isTrunk: true },
      { id: 'ref-feature', name: 'feature', headCommit: 'b', nodeCount: 0, isTrunk: false }
    ]);
    mocks.rtCreateRefFromRefShadowV2.mockResolvedValue({ baseCommitId: 'a', baseOrdinal: 1 });
    mocks.rtSetCurrentRefShadowV2.mockResolvedValue(undefined);

    const res = await POST(createRequest({ name: 'new-branch', fromRef: 'main' }, 'POST'), { params: { id: 'project-1' } });
    expect(res.status).toBe(201);
    expect(mocks.getPreviousResponseId).toHaveBeenCalledWith('project-1', { id: 'ref-main', name: 'main' });
    expect(mocks.rtCreateRefFromRefShadowV2).toHaveBeenCalledWith({
      projectId: 'project-1',
      newRefName: 'new-branch',
      fromRefId: 'ref-main',
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp-123'
    });
    expect(mocks.createBranch).not.toHaveBeenCalled();
  });

  it('creates branch from assistant node in Postgres using the node response id', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-main', refName: 'main' });
    mocks.rtListRefsShadowV2.mockResolvedValue([{ id: 'ref-main', name: 'main', provider: 'openai_responses' }]);
    mocks.rtGetNodeContentShadowV1.mockResolvedValue({
      id: 'node-1',
      type: 'message',
      role: 'assistant',
      responseId: 'resp-node'
    });
    mocks.rtCreateRefFromNodeShadowV2.mockResolvedValue({ baseCommitId: 'a', baseOrdinal: 1 });
    mocks.rtSetCurrentRefShadowV2.mockResolvedValue(undefined);

    const res = await POST(createRequest({ name: 'split', fromNodeId: 'node-1' }, 'POST'), {
      params: { id: 'project-1' }
    });

    expect(res.status).toBe(201);
    expect(mocks.rtCreateRefFromNodeShadowV2).toHaveBeenCalledWith({
      projectId: 'project-1',
      newRefName: 'split',
      sourceRefId: 'ref-main',
      nodeId: 'node-1',
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp-node'
    });
  });

  it('returns 400 when creating a Postgres branch from a missing base ref', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-main', refName: 'main' });
    mocks.rtListRefsShadowV2.mockResolvedValue([{ id: 'ref-main', name: 'main', headCommit: 'a', nodeCount: 2, isTrunk: true }]);

    const res = await POST(createRequest({ name: 'new-branch', fromRef: 'nope' }, 'POST'), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('creates git branch from assistant node using the node response id', async () => {
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true, provider: 'openai_responses' }
    ]);
    mocks.readNodesFromRef.mockResolvedValue([
      { id: 'node-1', type: 'message', role: 'assistant', responseId: 'resp-node' }
    ]);
    mocks.getCommitHashForNode.mockResolvedValue('commit-hash-1');

    const res = await POST(createRequest({ name: 'split', fromNodeId: 'node-1' }, 'POST'), {
      params: { id: 'project-1' }
    });

    expect(res.status).toBe(201);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'split', 'commit-hash-1', {
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp-node'
    });
  });

  it('switches branch', async () => {
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 2, isTrunk: false }
    ]);
    const res = await PATCH(createRequest({ name: 'feature' }, 'PATCH'), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.switchBranch).toHaveBeenCalledWith('project-1', 'feature');
  });

  it('prefers per-user current branch when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-feature', refName: 'feature' });
    mocks.rtListRefsShadowV2.mockResolvedValue([{ id: 'ref-feature', name: 'feature', headCommit: '', nodeCount: 0, isTrunk: false }]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.currentBranch).toBe('feature');
  });

  it('sets per-user current branch on PATCH when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtListRefsShadowV2.mockResolvedValue([
      { id: 'ref-main', name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true },
      { id: 'ref-feature', name: 'feature', headCommit: 'b', nodeCount: 2, isTrunk: false }
    ]);
    mocks.rtSetCurrentRefShadowV2.mockResolvedValue(undefined);

    const res = await PATCH(createRequest({ name: 'feature' }, 'PATCH'), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.rtSetCurrentRefShadowV2).toHaveBeenCalledWith({ projectId: 'project-1', refId: 'ref-feature' });
    expect(mocks.switchBranch).not.toHaveBeenCalled();
  });

  it('validates payload', async () => {
    const res = await POST(createRequest({ name: '' }, 'POST'), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });
});
