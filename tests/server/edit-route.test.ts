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
  getDefaultModelForProvider: vi.fn(),
  getProviderTokenLimit: vi.fn(),
  rtCreateRefFromNodeParentShadowV1: vi.fn(),
  rtAppendNodeToRefShadowV1: vi.fn(),
  rtSetCurrentRefShadowV1: vi.fn(),
  rtGetHistoryShadowV1: vi.fn(),
  rtGetCurrentRefShadowV1: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getBranchConfigMap: vi.fn(),
  resolveBranchConfig: vi.fn()
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
  rtCreateRefFromNodeParentShadowV1: mocks.rtCreateRefFromNodeParentShadowV1
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtAppendNodeToRefShadowV1: mocks.rtAppendNodeToRefShadowV1
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtSetCurrentRefShadowV1: mocks.rtSetCurrentRefShadowV1,
  rtGetCurrentRefShadowV1: mocks.rtGetCurrentRefShadowV1
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetHistoryShadowV1: mocks.rtGetHistoryShadowV1
}));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

const baseUrl = 'http://localhost/api/projects/project-1/edit';

function createRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/edit', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
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
    mocks.getDefaultModelForProvider.mockReturnValue('mock');
    mocks.getProviderTokenLimit.mockResolvedValue(4000);
    mocks.getBranchConfigMap.mockResolvedValue({ main: { provider: 'mock', model: 'mock' } });
    mocks.resolveBranchConfig.mockImplementation(() => ({ provider: 'mock', model: 'mock' }));
    mocks.streamAssistantCompletion.mockImplementation(async function* () {
      yield { type: 'text', content: 'foo' };
      yield { type: 'text', content: 'bar' };
    });
    process.env.RT_STORE = 'git';
    mocks.rtGetHistoryShadowV1.mockResolvedValue([]);
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'main' });
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
    mocks.rtCreateRefFromNodeParentShadowV1.mockResolvedValue({ baseCommitId: 'c0', baseOrdinal: 0 });
    mocks.rtSetCurrentRefShadowV1.mockResolvedValue(undefined);
    mocks.createSupabaseServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  content_json: { id: 'node-5', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: null }
                },
                error: null
              })
            })
          })
        })
      })
    });
    mocks.rtGetHistoryShadowV1.mockImplementation(async ({ refName }: any) => {
      if (refName === 'edit-123') {
        return [{ ordinal: 0, nodeJson: { id: 'node-4', type: 'message', role: 'user', content: 'Before', timestamp: 0, parent: null } }];
      }
      return [];
    });
    mocks.rtAppendNodeToRefShadowV1.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'node-1',
      ordinal: 1,
      artefactId: null,
      artefactContentHash: null
    });

    const res = await POST(createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(201);
    expect(mocks.createSupabaseServerClient).toHaveBeenCalled();
    expect(mocks.rtCreateRefFromNodeParentShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sourceRefName: 'main',
        newRefName: 'edit-123',
        nodeId: 'node-5',
        provider: 'mock',
        model: 'mock'
      })
    );
    expect(mocks.rtSetCurrentRefShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', refName: 'edit-123' });
    expect(mocks.rtAppendNodeToRefShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', refName: 'edit-123', attachDraft: true })
    );
    expect(mocks.rtAppendNodeToRefShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', refName: 'edit-123', attachDraft: false })
    );
    expect(mocks.appendNode).not.toHaveBeenCalled();
    expect(mocks.createBranch).not.toHaveBeenCalled();
  });
});
