import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/edit/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getCurrentBranchName: vi.fn(),
  createBranch: vi.fn(),
  appendNode: vi.fn(),
  getCommitHashForNode: vi.fn(),
  readNodesFromRef: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  rtCreateRefFromNodeParentShadowV1: vi.fn(),
  rtAppendNodeToRefShadowV1: vi.fn(),
  rtSetCurrentRefShadowV1: vi.fn()
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

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow
}));

vi.mock('@/src/store/pg/branches', () => ({
  rtCreateRefFromNodeParentShadowV1: mocks.rtCreateRefFromNodeParentShadowV1
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtAppendNodeToRefShadowV1: mocks.rtAppendNodeToRefShadowV1
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtSetCurrentRefShadowV1: mocks.rtSetCurrentRefShadowV1
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
    mocks.appendNode.mockResolvedValue({ id: 'node-1', type: 'message' });
    mocks.readNodesFromRef.mockResolvedValue([
      { id: 'node-5', type: 'message', role: 'user', content: 'Original', timestamp: 0, parent: null }
    ]);
    process.env.RT_PG_SHADOW_WRITE = 'false';
  });

  it('creates edit branch and appends node', async () => {
    const res = await POST(createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(201);
    expect(mocks.getCommitHashForNode).toHaveBeenCalledWith('project-1', 'main', 'node-5', { parent: true });
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'edit-123', 'commit-hash');
    expect(mocks.appendNode).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ role: 'user', content: 'Edited message' }),
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
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', expect.stringMatching(/^edit-/), 'commit-hash');
  });

  it('validates body', async () => {
    const res = await POST(createRequest({ content: '', nodeId: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await POST(createRequest({ content: 'X' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });

  it('shadow-writes edit branch + node when RT_PG_SHADOW_WRITE=true', async () => {
    process.env.RT_PG_SHADOW_WRITE = 'true';
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });
    mocks.rtCreateRefFromNodeParentShadowV1.mockResolvedValue({ baseCommitId: 'c0', baseOrdinal: 0 });
    mocks.rtSetCurrentRefShadowV1.mockResolvedValue(undefined);
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
    expect(mocks.rtCreateRefFromNodeParentShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', sourceRefName: 'main', newRefName: 'edit-123', nodeId: 'node-5' })
    );
    expect(mocks.rtSetCurrentRefShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', refName: 'edit-123' });
    expect(mocks.rtAppendNodeToRefShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', refName: 'edit-123', nodeId: 'node-1' })
    );
  });
});
