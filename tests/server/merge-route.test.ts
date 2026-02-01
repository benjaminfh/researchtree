// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/merge/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  mergeBranch: vi.fn(),
  getCurrentBranchName: vi.fn(),
  rtMergeOursShadowV2: vi.fn(),
  rtListRefsShadowV2: vi.fn(),
  rtGetHistoryShadowV2: vi.fn(),
  rtGetCanvasShadowV2: vi.fn(),
  rtAcquireRefLeaseShadowV1: vi.fn(),
  rtAppendNodeToRefShadowV2: vi.fn(),
  appendNodeToRefNoCheckout: vi.fn(),
  buildChatContext: vi.fn(),
  getBranchConfigMap: vi.fn(),
  requireUserApiKeyForProvider: vi.fn(),
  streamAssistantCompletion: vi.fn(),
  getProviderTokenLimit: vi.fn()
}));
const authzMocks = vi.hoisted(() => ({
  requireProjectEditor: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/branches', () => ({
  mergeBranch: mocks.mergeBranch
}));

vi.mock('@git/utils', () => ({
  getCurrentBranchName: mocks.getCurrentBranchName
}));

vi.mock('@git/nodes', () => ({
  appendNodeToRefNoCheckout: mocks.appendNodeToRefNoCheckout
}));

vi.mock('@/src/store/pg/merge', () => ({
  rtMergeOursShadowV2: mocks.rtMergeOursShadowV2
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV2: mocks.rtListRefsShadowV2,
  rtGetHistoryShadowV2: mocks.rtGetHistoryShadowV2,
  rtGetCanvasShadowV2: mocks.rtGetCanvasShadowV2
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtAppendNodeToRefShadowV2: mocks.rtAppendNodeToRefShadowV2
}));

vi.mock('@/src/store/pg/leases', () => ({
  rtAcquireRefLeaseShadowV1: mocks.rtAcquireRefLeaseShadowV1
}));

vi.mock('@/src/server/context', () => ({
  buildChatContext: mocks.buildChatContext
}));

vi.mock('@/src/server/branchConfig', () => ({
  getBranchConfigMap: mocks.getBranchConfigMap,
  resolveBranchConfig: () => ({ provider: 'openai', model: 'gpt-5.2' })
}));

vi.mock('@/src/server/llm', () => ({
  streamAssistantCompletion: mocks.streamAssistantCompletion
}));

vi.mock('@/src/server/providerCapabilities', () => ({
  getProviderTokenLimit: mocks.getProviderTokenLimit
}));

vi.mock('@/src/server/llmUserKeys', () => ({
  requireUserApiKeyForProvider: mocks.requireUserApiKeyForProvider
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectEditor: authzMocks.requireProjectEditor
}));

const baseUrl = 'http://localhost/api/projects/project-1/merge';

function createRequest(body: Record<string, unknown>) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseSessionId: 'lease-test', ...body })
  });
}

describe('/api/projects/[id]/merge', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    Object.values(authzMocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.mergeBranch.mockResolvedValue({
      id: 'merge-1',
      type: 'merge',
      mergeFrom: 'feature',
      mergeSummary: 'summary',
      mergedAssistantContent: 'payload',
      canvasDiff: 'diff'
    });
    mocks.getCurrentBranchName.mockResolvedValue('main');
    mocks.buildChatContext.mockResolvedValue({ systemPrompt: 'system', messages: [] });
    mocks.getBranchConfigMap.mockResolvedValue({ main: { provider: 'openai', model: 'gpt-5.2' } });
    mocks.requireUserApiKeyForProvider.mockResolvedValue('key');
    mocks.getProviderTokenLimit.mockResolvedValue(8000);
    mocks.streamAssistantCompletion.mockReturnValue(
      (async function* () {
        yield { type: 'text', content: 'Merge received' };
        yield { type: 'raw_response', content: '', payload: { responseId: 'resp-1' } };
      })()
    );
    process.env.RT_STORE = 'git';
  });

  it('merges a branch and returns merge node', async () => {
    const res = await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'bring back work' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(200);
    expect(mocks.mergeBranch).toHaveBeenCalledWith(
      'project-1',
      'feature',
      'bring back work',
      expect.objectContaining({ targetBranch: 'main' })
    );
    const json = await res.json();
    expect(json.mergeNode).toBeDefined();
  });

  it('passes targetBranch when provided', async () => {
    await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary', targetBranch: 'release' }), {
      params: { id: 'project-1' }
    });
    expect(mocks.mergeBranch).toHaveBeenCalledWith(
      'project-1',
      'feature',
      'summary',
      expect.objectContaining({ targetBranch: 'release' })
    );
  });

  it('passes sourceAssistantNodeId when provided', async () => {
    await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary', sourceAssistantNodeId: 'node-a1' }), {
      params: { id: 'project-1' }
    });
    expect(mocks.mergeBranch).toHaveBeenCalledWith(
      'project-1',
      'feature',
      'summary',
      expect.objectContaining({ sourceAssistantNodeId: 'node-a1' })
    );
  });

  it('validates body', async () => {
    const res = await POST(createRequest({ sourceBranch: '', mergeSummary: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });

  it('uses Postgres merge when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtListRefsShadowV2.mockResolvedValue([
      { id: 'ref-main', name: 'main', headCommit: 't1', nodeCount: 1, isTrunk: true },
      { id: 'ref-feature', name: 'feature', headCommit: 's1', nodeCount: 2, isTrunk: false }
    ]);
    mocks.rtGetHistoryShadowV2.mockImplementation(async ({ refId }: any) => {
      if (refId === 'ref-main') return [];
      return [{ ordinal: 0, nodeJson: { id: 'asst-1', type: 'message', role: 'assistant', content: 'hi' } }];
    });
    mocks.rtGetCanvasShadowV2.mockResolvedValue({ content: '', contentHash: '', updatedAt: null, source: 'empty' });
    mocks.rtMergeOursShadowV2.mockResolvedValue({ newCommitId: 'c1', nodeId: 'merge-1', ordinal: 0 });

    const res = await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary', targetBranch: 'main' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(200);
    expect(mocks.rtMergeOursShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        targetRefId: 'ref-main',
        sourceRefId: 'ref-feature',
        mergeNodeJson: expect.objectContaining({ type: 'merge', mergeFrom: 'feature', mergeSummary: 'summary' })
      })
    );
    expect(mocks.mergeBranch).not.toHaveBeenCalled();
  });
});
