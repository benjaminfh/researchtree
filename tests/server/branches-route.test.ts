import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/projects/[id]/branches/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  getCurrentBranchName: vi.fn(),
  rtGetCurrentRefShadowV1: vi.fn(),
  rtSetCurrentRefShadowV1: vi.fn(),
  rtListRefsShadowV1: vi.fn(),
  rtCreateRefFromRefShadowV1: vi.fn()
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
  getCurrentBranchName: mocks.getCurrentBranchName
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtGetCurrentRefShadowV1: mocks.rtGetCurrentRefShadowV1,
  rtSetCurrentRefShadowV1: mocks.rtSetCurrentRefShadowV1
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV1: mocks.rtListRefsShadowV1
}));

vi.mock('@/src/store/pg/branches', () => ({
  rtCreateRefFromRefShadowV1: mocks.rtCreateRefFromRefShadowV1
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
    mocks.rtListRefsShadowV1.mockResolvedValue([
      { name: 'main', headCommit: '', nodeCount: 2, isTrunk: true },
      { name: 'feature', headCommit: '', nodeCount: 0, isTrunk: false }
    ]);
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'main' });

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(mocks.rtListRefsShadowV1).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(json.branches).toHaveLength(2);
  });

  it('creates branch', async () => {
    const res = await POST(createRequest({ name: 'feature', fromRef: 'main' }, 'POST'), { params: { id: 'project-1' } });
    expect(res.status).toBe(201);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'feature', 'main');
  });

  it('creates branch via Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'main' });
    mocks.rtListRefsShadowV1.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 2, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 0, isTrunk: false }
    ]);
    mocks.rtCreateRefFromRefShadowV1.mockResolvedValue({ baseCommitId: 'a', baseOrdinal: 1 });
    mocks.rtSetCurrentRefShadowV1.mockResolvedValue(undefined);

    const res = await POST(createRequest({ name: 'new-branch', fromRef: 'main' }, 'POST'), { params: { id: 'project-1' } });
    expect(res.status).toBe(201);
    expect(mocks.rtCreateRefFromRefShadowV1).toHaveBeenCalledWith({
      projectId: 'project-1',
      newRefName: 'new-branch',
      fromRefName: 'main'
    });
    expect(mocks.createBranch).not.toHaveBeenCalled();
  });

  it('returns 400 when creating a Postgres branch from a missing base ref', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'main' });
    mocks.rtListRefsShadowV1.mockResolvedValue([{ name: 'main', headCommit: 'a', nodeCount: 2, isTrunk: true }]);

    const res = await POST(createRequest({ name: 'new-branch', fromRef: 'nope' }, 'POST'), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
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
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'feature' });
    mocks.rtListRefsShadowV1.mockResolvedValue([{ name: 'feature', headCommit: '', nodeCount: 0, isTrunk: false }]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.currentBranch).toBe('feature');
  });

  it('sets per-user current branch on PATCH when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtListRefsShadowV1.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 2, isTrunk: false }
    ]);
    mocks.rtSetCurrentRefShadowV1.mockResolvedValue(undefined);

    const res = await PATCH(createRequest({ name: 'feature' }, 'PATCH'), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.rtSetCurrentRefShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', refName: 'feature' });
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
