// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/edit/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getCurrentBranchName: vi.fn(),
  createBranch: vi.fn(),
  appendNode: vi.fn(),
  getCommitHashForNode: vi.fn(),
  readNodesFromRef: vi.fn(),
  buildChatContext: vi.fn(),
  streamAssistantCompletion: vi.fn(),
  resolveLLMProvider: vi.fn(),
  resolveOpenAIProviderSelection: vi.fn(),
  getDefaultModelForProvider: vi.fn(),
  getProviderTokenLimit: vi.fn(),
  rtCreateRefFromNodeParentShadowV2: vi.fn(),
  rtAppendNodeToRefShadowV2: vi.fn(),
  rtSetCurrentRefShadowV2: vi.fn(),
  rtGetHistoryShadowV2: vi.fn(),
  rtGetCurrentRefShadowV2: vi.fn(),
  rtGetNodeContentShadowV1: vi.fn(),
  rtListRefsShadowV2: vi.fn(),
  getBranchConfigMap: vi.fn(),
  resolveBranchConfig: vi.fn(),
  resolveRefByName: vi.fn(),
  resolveCurrentRef: vi.fn(),
  requireUserApiKeyForProvider: vi.fn()
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
  createBranch: mocks.createBranch
}));

vi.mock('@git/nodes', () => ({
  appendNode: mocks.appendNode
}));

vi.mock('@/src/server/context', () => ({
  buildChatContext: mocks.buildChatContext
}));

vi.mock('@/src/server/llm', () => ({
  streamAssistantCompletion: mocks.streamAssistantCompletion,
  resolveLLMProvider: mocks.resolveLLMProvider,
  resolveOpenAIProviderSelection: mocks.resolveOpenAIProviderSelection,
  getDefaultModelForProvider: mocks.getDefaultModelForProvider
}));

vi.mock('@/src/server/providerCapabilities', () => ({
  getProviderTokenLimit: mocks.getProviderTokenLimit
}));

vi.mock('@/src/server/branchConfig', () => ({
  getBranchConfigMap: mocks.getBranchConfigMap,
  resolveBranchConfig: mocks.resolveBranchConfig
}));

vi.mock('@/src/store/pg/branches', () => ({
  rtCreateRefFromNodeParentShadowV2: mocks.rtCreateRefFromNodeParentShadowV2
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtAppendNodeToRefShadowV2: mocks.rtAppendNodeToRefShadowV2,
  rtGetNodeContentShadowV1: mocks.rtGetNodeContentShadowV1
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtSetCurrentRefShadowV2: mocks.rtSetCurrentRefShadowV2,
  rtGetCurrentRefShadowV2: mocks.rtGetCurrentRefShadowV2
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetHistoryShadowV2: mocks.rtGetHistoryShadowV2,
  rtListRefsShadowV2: mocks.rtListRefsShadowV2
}));

vi.mock('@/src/server/pgRefs', () => ({
  resolveRefByName: mocks.resolveRefByName,
  resolveCurrentRef: mocks.resolveCurrentRef
}));

vi.mock('@/src/server/llmUserKeys', () => ({
  requireUserApiKeyForProvider: mocks.requireUserApiKeyForProvider
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectEditor: authzMocks.requireProjectEditor
}));

const baseUrl = 'http://localhost/api/projects/project-1/edit';

function createRequest(body: Record<string, unknown>) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseSessionId: 'lease-test', ...body })
  });
}

describe('/api/projects/[id]/edit', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    Object.values(authzMocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getCurrentBranchName.mockResolvedValue('main');
    mocks.getCommitHashForNode.mockResolvedValue('commit-hash');
    mocks.appendNode.mockImplementation(async (_projectId: string, node: any) => {
      if (node?.type === 'message' && node?.role === 'assistant') {
        return { id: 'node-asst-1', ...node };
      }
      return { id: 'node-user-1', ...node };
    });
    mocks.readNodesFromRef.mockResolvedValue([
      { id: 'node-5', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: null }
    ]);
    mocks.buildChatContext.mockResolvedValue({
      systemPrompt: 'system',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'Edited message' }
      ]
    });
    mocks.resolveLLMProvider.mockReturnValue('mock');
    mocks.resolveOpenAIProviderSelection.mockImplementation((provider?: string) => provider ?? 'openai');
    mocks.getDefaultModelForProvider.mockReturnValue('mock');
    mocks.getProviderTokenLimit.mockResolvedValue(4000);
    mocks.getBranchConfigMap.mockResolvedValue({ main: { provider: 'mock', model: 'mock' } });
    mocks.resolveBranchConfig.mockImplementation(() => ({ provider: 'mock', model: 'mock' }));
    mocks.streamAssistantCompletion.mockImplementation(async function* () {
      yield { type: 'text', content: 'foo' };
      yield { type: 'text', content: 'bar' };
    });
    mocks.requireUserApiKeyForProvider.mockResolvedValue('test-key');
    process.env.RT_STORE = 'git';
    mocks.rtGetHistoryShadowV2.mockResolvedValue([]);
    mocks.rtGetCurrentRefShadowV2.mockResolvedValue({ refId: 'ref-main', refName: 'main' });
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-main', name: 'main' });
  });

  it('creates edit branch, appends edited user node, and generates assistant reply', async () => {
    const res = await POST(createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(201);
    expect(mocks.getCommitHashForNode).toHaveBeenCalledWith('project-1', 'main', 'node-5', { parent: true });
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'edit-123', 'commit-hash', {
      provider: 'mock',
      model: 'mock',
      previousResponseId: null
    });
    expect(mocks.appendNode).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ role: 'user', content: 'Edited message' }),
      expect.objectContaining({ ref: 'edit-123' })
    );
    expect(mocks.buildChatContext).toHaveBeenCalledWith('project-1', expect.objectContaining({ ref: 'edit-123' }));
    expect(mocks.streamAssistantCompletion).toHaveBeenCalledWith(expect.objectContaining({ provider: 'mock' }));
    expect(mocks.appendNode).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ role: 'assistant', content: 'foobar' }),
      expect.objectContaining({ ref: 'edit-123' })
    );
  });

  it('preserves the original node role when editing', async () => {
    mocks.readNodesFromRef.mockResolvedValueOnce([
      { id: 'node-5', type: 'message', role: 'assistant', content: 'Original', timestamp: 0, parent: null }
    ]);
    const res = await POST(createRequest({ content: 'Edited assistant', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(201);
    expect(mocks.appendNode).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ role: 'assistant', content: 'Edited assistant' }),
      expect.objectContaining({ ref: 'edit-123' })
    );
    expect(mocks.streamAssistantCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 when the node is not a message', async () => {
    mocks.readNodesFromRef.mockResolvedValueOnce([{ id: 'node-5', type: 'merge' }]);
    const res = await POST(createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(400);
  });

  it('uses default branch name and current ref when not provided', async () => {
    mocks.getCurrentBranchName.mockResolvedValueOnce('feature/foo');
    mocks.readNodesFromRef.mockResolvedValueOnce([
      { id: 'node-1', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: null }
    ]);
    const res = await POST(createRequest({ content: 'Default branch', nodeId: 'node-1' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(201);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', expect.stringMatching(/^edit-/), 'commit-hash', {
      provider: 'mock',
      model: 'mock',
      previousResponseId: null
    });
  });

  it('validates body', async () => {
    const res = await POST(createRequest({ content: '', nodeId: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await POST(createRequest({ content: 'X', nodeId: 'node-1' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });

  it('uses Postgres for edit branch + node when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtCreateRefFromNodeParentShadowV2.mockResolvedValue({ baseCommitId: 'c0', baseOrdinal: 0 });
    mocks.rtSetCurrentRefShadowV2.mockResolvedValue(undefined);
    mocks.rtGetNodeContentShadowV1.mockResolvedValue({
      id: 'node-5',
      type: 'message',
      role: 'user',
      content: 'Original',
      timestamp: 0,
      parent: null
    });
    mocks.rtGetHistoryShadowV2.mockImplementation(async ({ refId }: any) => {
      if (refId === 'ref-edit') {
        return [{ ordinal: 0, nodeJson: { id: 'node-4', type: 'message', role: 'user', content: 'Before', timestamp: 0, parent: null } }];
      }
      return [];
    });
    mocks.rtAppendNodeToRefShadowV2.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'node-1',
      ordinal: 1,
      artefactId: null,
      artefactContentHash: null
    });
    mocks.rtListRefsShadowV2.mockResolvedValue([{ id: 'ref-edit', name: 'edit-123' }]);
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-main', name: 'main' });

    const res = await POST(createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(201);
    expect(mocks.rtGetNodeContentShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', nodeId: 'node-5' });
    expect(mocks.rtCreateRefFromNodeParentShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sourceRefId: 'ref-main',
        newRefName: 'edit-123',
        nodeId: 'node-5',
        provider: 'mock',
        model: 'mock'
      })
    );
    expect(mocks.rtSetCurrentRefShadowV2).toHaveBeenCalledWith({ projectId: 'project-1', refId: 'ref-edit' });
    expect(mocks.rtAppendNodeToRefShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', refId: 'ref-edit', attachDraft: true })
    );
    expect(mocks.rtAppendNodeToRefShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', refId: 'ref-edit', attachDraft: false })
    );
    expect(mocks.appendNode).not.toHaveBeenCalled();
    expect(mocks.createBranch).not.toHaveBeenCalled();
  });

  it('uses parent assistant responseId when editing a user message on openai_responses (git)', async () => {
    mocks.getBranchConfigMap.mockResolvedValueOnce({ main: { provider: 'openai_responses', model: 'gpt-5.2' } });
    mocks.resolveBranchConfig.mockImplementation(({ provider, model, fallback }: any) => ({
      provider: provider ?? fallback?.provider ?? 'openai_responses',
      model: model ?? fallback?.model ?? 'gpt-5.2'
    }));
    mocks.readNodesFromRef.mockResolvedValueOnce([
      { id: 'node-asst', type: 'message', role: 'assistant', responseId: 'resp-parent' },
      { id: 'node-user', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: 'node-asst' }
    ]);

    const res = await POST(
      createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-user' }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(201);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'edit-123', 'commit-hash', {
      provider: 'openai_responses',
      model: 'gpt-5.2',
      previousResponseId: 'resp-parent'
    });
  });

  it('clears previousResponseId when switching providers on edit (git)', async () => {
    mocks.getBranchConfigMap.mockResolvedValueOnce({ main: { provider: 'openai_responses', model: 'gpt-5.2' } });
    mocks.resolveBranchConfig.mockImplementation(({ provider, model, fallback }: any) => ({
      provider: provider ?? fallback?.provider ?? 'openai_responses',
      model: model ?? fallback?.model ?? 'gpt-5.2'
    }));
    mocks.readNodesFromRef.mockResolvedValueOnce([
      { id: 'node-asst', type: 'message', role: 'assistant', responseId: 'resp-parent' },
      { id: 'node-user', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: 'node-asst' }
    ]);

    const res = await POST(
      createRequest({
        content: 'Edited message',
        branchName: 'edit-123',
        fromRef: 'main',
        nodeId: 'node-user',
        llmProvider: 'gemini',
        llmModel: 'gemini-3-pro-preview'
      }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(201);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'edit-123', 'commit-hash', {
      provider: 'gemini',
      model: 'gemini-3-pro-preview',
      previousResponseId: null
    });
  });

  it('uses parent assistant responseId when editing a user message on openai_responses (pg)', async () => {
    process.env.RT_STORE = 'pg';
    mocks.getBranchConfigMap.mockResolvedValueOnce({ main: { provider: 'openai_responses', model: 'gpt-5.2' } });
    mocks.resolveBranchConfig.mockImplementation(({ provider, model, fallback }: any) => ({
      provider: provider ?? fallback?.provider ?? 'openai_responses',
      model: model ?? fallback?.model ?? 'gpt-5.2'
    }));
    mocks.rtCreateRefFromNodeParentShadowV2.mockResolvedValue({ baseCommitId: 'c0', baseOrdinal: 0 });
    mocks.rtSetCurrentRefShadowV2.mockResolvedValue(undefined);
    mocks.rtGetNodeContentShadowV1.mockImplementation(async ({ nodeId }: any) => {
      if (nodeId === 'node-user') {
        return { id: 'node-user', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: 'node-asst' };
      }
      return { id: 'node-asst', type: 'message', role: 'assistant', responseId: 'resp-parent' };
    });
    mocks.rtGetHistoryShadowV2.mockResolvedValue([]);
    mocks.rtAppendNodeToRefShadowV2.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'node-1',
      ordinal: 1,
      artefactId: null,
      artefactContentHash: null
    });
    mocks.rtListRefsShadowV2.mockResolvedValue([{ id: 'ref-edit', name: 'edit-123' }]);
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-main', name: 'main' });

    const res = await POST(
      createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-user' }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(201);
    expect(mocks.rtCreateRefFromNodeParentShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sourceRefId: 'ref-main',
        newRefName: 'edit-123',
        nodeId: 'node-user',
        provider: 'openai_responses',
        model: 'gpt-5.2',
        previousResponseId: 'resp-parent'
      })
    );
  });

  it('clears previousResponseId when switching providers on edit (pg)', async () => {
    process.env.RT_STORE = 'pg';
    mocks.getBranchConfigMap.mockResolvedValueOnce({ main: { provider: 'openai_responses', model: 'gpt-5.2' } });
    mocks.resolveBranchConfig.mockImplementation(({ provider, model, fallback }: any) => ({
      provider: provider ?? fallback?.provider ?? 'openai_responses',
      model: model ?? fallback?.model ?? 'gpt-5.2'
    }));
    mocks.rtCreateRefFromNodeParentShadowV2.mockResolvedValue({ baseCommitId: 'c0', baseOrdinal: 0 });
    mocks.rtSetCurrentRefShadowV2.mockResolvedValue(undefined);
    mocks.rtGetNodeContentShadowV1.mockImplementation(async ({ nodeId }: any) => {
      if (nodeId === 'node-user') {
        return { id: 'node-user', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: 'node-asst' };
      }
      return { id: 'node-asst', type: 'message', role: 'assistant', responseId: 'resp-parent' };
    });
    mocks.rtGetHistoryShadowV2.mockResolvedValue([]);
    mocks.rtAppendNodeToRefShadowV2.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'node-1',
      ordinal: 1,
      artefactId: null,
      artefactContentHash: null
    });
    mocks.rtListRefsShadowV2.mockResolvedValue([{ id: 'ref-edit', name: 'edit-123' }]);
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-main', name: 'main' });

    const res = await POST(
      createRequest({
        content: 'Edited message',
        branchName: 'edit-123',
        fromRef: 'main',
        nodeId: 'node-user',
        llmProvider: 'gemini',
        llmModel: 'gemini-3-pro-preview'
      }),
      { params: { id: 'project-1' } }
    );

    expect(res.status).toBe(201);
    expect(mocks.rtCreateRefFromNodeParentShadowV2).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sourceRefId: 'ref-main',
        newRefName: 'edit-123',
        nodeId: 'node-user',
        provider: 'gemini',
        model: 'gemini-3-pro-preview',
        previousResponseId: null
      })
    );
  });
});
