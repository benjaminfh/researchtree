import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/merge/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  mergeBranch: vi.fn(),
  getCurrentBranchName: vi.fn(),
  rtMergeOursShadowV1: vi.fn(),
  rtListRefsShadowV1: vi.fn(),
  rtGetHistoryShadowV1: vi.fn(),
  rtGetCanvasShadowV1: vi.fn()
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

vi.mock('@/src/store/pg/merge', () => ({
  rtMergeOursShadowV1: mocks.rtMergeOursShadowV1
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV1: mocks.rtListRefsShadowV1,
  rtGetHistoryShadowV1: mocks.rtGetHistoryShadowV1,
  rtGetCanvasShadowV1: mocks.rtGetCanvasShadowV1
}));

const baseUrl = 'http://localhost/api/projects/project-1/merge';

function createRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/merge', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.mergeBranch.mockResolvedValue({ id: 'merge-1', type: 'merge' });
    mocks.getCurrentBranchName.mockResolvedValue('main');
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
    mocks.rtListRefsShadowV1.mockResolvedValue([
      { name: 'main', headCommit: 't1', nodeCount: 1, isTrunk: true },
      { name: 'feature', headCommit: 's1', nodeCount: 2, isTrunk: false }
    ]);
    mocks.rtGetHistoryShadowV1.mockImplementation(async ({ refName }: any) => {
      if (refName === 'main') return [];
      return [{ ordinal: 0, nodeJson: { id: 'asst-1', type: 'message', role: 'assistant', content: 'hi' } }];
    });
    mocks.rtGetCanvasShadowV1.mockResolvedValue({ content: '', contentHash: '', updatedAt: null, source: 'empty' });
    mocks.rtMergeOursShadowV1.mockResolvedValue({ newCommitId: 'c1', nodeId: 'merge-1', ordinal: 0 });

    const res = await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary', targetBranch: 'main' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(200);
    expect(mocks.rtMergeOursShadowV1).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        targetRefName: 'main',
        sourceRefName: 'feature',
        mergeNodeJson: expect.objectContaining({ type: 'merge', mergeFrom: 'feature', mergeSummary: 'summary' })
      })
    );
    expect(mocks.mergeBranch).not.toHaveBeenCalled();
  });
});
