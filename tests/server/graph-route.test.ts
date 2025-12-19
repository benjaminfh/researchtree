import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/projects/[id]/graph/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listBranches: vi.fn(),
  getCurrentBranchName: vi.fn(),
  readNodesFromRef: vi.fn(),
  getStarredNodeIds: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  rtListRefsShadowV1: vi.fn(),
  rtGetHistoryShadowV1: vi.fn(),
  rtGetStarredNodeIdsShadowV1: vi.fn(),
  rtGetCurrentRefShadowV1: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/branches', () => ({
  listBranches: mocks.listBranches
}));

vi.mock('@git/utils', () => ({
  getCurrentBranchName: mocks.getCurrentBranchName,
  readNodesFromRef: mocks.readNodesFromRef
}));

vi.mock('@git/stars', () => ({
  getStarredNodeIds: mocks.getStarredNodeIds
}));

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV1: mocks.rtListRefsShadowV1,
  rtGetHistoryShadowV1: mocks.rtGetHistoryShadowV1,
  rtGetStarredNodeIdsShadowV1: mocks.rtGetStarredNodeIdsShadowV1
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtGetCurrentRefShadowV1: mocks.rtGetCurrentRefShadowV1
}));

const baseUrl = 'http://localhost/api/projects/project-1/graph';

describe('/api/projects/[id]/graph', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    process.env.RT_STORE = 'git';
  });

  it('returns a bounded graph payload for all branches', async () => {
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 650, isTrunk: true },
      { name: 'feature/x', headCommit: 'b', nodeCount: 3, isTrunk: false }
    ]);
    mocks.getCurrentBranchName.mockResolvedValue('feature/x');
    mocks.getStarredNodeIds.mockResolvedValue(['n-2']);

    const mainNodes = Array.from({ length: 650 }, (_, i) => ({
      id: `m-${i}`,
      type: 'message',
      role: 'user',
      content: `m${i}`,
      timestamp: i,
      parent: i === 0 ? null : `m-${i - 1}`
    }));
    const featureNodes = Array.from({ length: 3 }, (_, i) => ({
      id: `f-${i}`,
      type: 'message',
      role: 'assistant',
      content: `f${i}`,
      timestamp: i,
      parent: i === 0 ? null : `f-${i - 1}`
    }));

    mocks.readNodesFromRef.mockImplementation(async (_projectId: string, ref: string) => {
      if (ref === 'main') return mainNodes;
      if (ref === 'feature/x') return featureNodes;
      return [];
    });

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;

    expect(data.trunkName).toBe('main');
    expect(data.currentBranch).toBe('feature/x');
    expect(data.branches).toHaveLength(2);
    expect(data.starredNodeIds).toEqual(['n-2']);

    expect(Object.keys(data.branchHistories).sort()).toEqual(['feature/x', 'main']);
    // Default cap is 500; ensure large histories are bounded.
    expect(data.branchHistories.main.length).toBe(500);
    expect(data.branchHistories['feature/x'].length).toBe(3);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValue(null);
    const res = await GET(new Request(baseUrl), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('uses Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });
    mocks.rtListRefsShadowV1.mockResolvedValue([
      { name: 'main', headCommit: '', nodeCount: 650, isTrunk: true },
      { name: 'feature/x', headCommit: '', nodeCount: 3, isTrunk: false }
    ]);
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'feature/x' });
    mocks.rtGetStarredNodeIdsShadowV1.mockResolvedValue(['n-2']);

    const mainNodes = Array.from({ length: 650 }, (_, i) => ({
      id: `m-${i}`,
      type: 'message',
      role: 'user',
      content: `m${i}`,
      timestamp: i,
      parent: i === 0 ? null : `m-${i - 1}`
    }));
    const featureNodes = Array.from({ length: 3 }, (_, i) => ({
      id: `f-${i}`,
      type: 'message',
      role: 'assistant',
      content: `f${i}`,
      timestamp: i,
      parent: i === 0 ? null : `f-${i - 1}`
    }));

    mocks.rtGetHistoryShadowV1.mockImplementation(async ({ refName }: any) => {
      const nodes = refName === 'main' ? mainNodes : refName === 'feature/x' ? featureNodes : [];
      return nodes.map((node, idx) => ({ ordinal: idx, nodeJson: node }));
    });

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.trunkName).toBe('main');
    expect(data.currentBranch).toBe('feature/x');
    expect(data.branches).toHaveLength(2);
    expect(data.starredNodeIds).toEqual(['n-2']);
    expect(data.branchHistories.main.length).toBe(500);
  });
});
