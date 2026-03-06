// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/projects/[id]/edit-stream/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getCurrentBranchName: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  appendNode: vi.fn(),
  getCommitHashForNode: vi.fn(),
  readNodesFromRef: vi.fn(),
  getBranchConfigMap: vi.fn(),
  registerStream: vi.fn(),
  releaseStream: vi.fn()
}));
const authzMocks = vi.hoisted(() => ({
  requireProjectEditor: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/utils', () => ({
  getCurrentBranchName: mocks.getCurrentBranchName,
  getCommitHashForNode: mocks.getCommitHashForNode,
  readNodesFromRef: mocks.readNodesFromRef
}));

vi.mock('@git/branches', () => ({
  createBranch: mocks.createBranch,
  switchBranch: mocks.switchBranch
}));

vi.mock('@git/nodes', () => ({
  appendNode: mocks.appendNode
}));

vi.mock('@/src/server/branchConfig', async () => {
  const actual = await vi.importActual<typeof import('@/src/server/branchConfig')>('@/src/server/branchConfig');
  return {
    ...actual,
    getBranchConfigMap: mocks.getBranchConfigMap
  };
});

vi.mock('@/src/server/stream-registry', () => ({
  registerStream: mocks.registerStream,
  releaseStream: mocks.releaseStream
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectEditor: authzMocks.requireProjectEditor
}));

const baseUrl = 'http://localhost/api/projects/project-1/edit-stream';

function createRequest(body: Record<string, unknown>) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseSessionId: 'lease-test', ...body })
  });
}

describe('/api/projects/[id]/edit-stream', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    Object.values(authzMocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getCurrentBranchName.mockResolvedValue('main');
    mocks.getCommitHashForNode.mockResolvedValue('commit-hash');
    mocks.readNodesFromRef.mockResolvedValue([
      { id: 'node-5', type: 'message', role: 'assistant', content: 'Original', timestamp: 0, parent: null }
    ]);
    mocks.appendNode.mockImplementation(async (_projectId: string, node: any) => ({ id: 'node-edited', ...node }));
    process.env.RT_STORE = 'git';
    delete process.env.LLM_ENABLED_PROVIDERS;
  });

  it('falls back to default enabled provider when source provider is disabled', async () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,gemini';
    mocks.getBranchConfigMap.mockResolvedValue({ main: { provider: 'openai', model: 'gpt-5.2' } });

    const res = await POST(
      createRequest({ content: 'Edited assistant', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(200);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'edit-123', 'commit-hash', {
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: null
    });
  });

  it('falls back to provider default model when source model is invalid', async () => {
    mocks.getBranchConfigMap.mockResolvedValue({ main: { provider: 'openai_responses', model: 'retired-model' } });

    const res = await POST(
      createRequest({ content: 'Edited assistant', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(200);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'edit-123', 'commit-hash', {
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: null
    });
  });
});

