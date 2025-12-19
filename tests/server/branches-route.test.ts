import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH } from '@/app/api/projects/[id]/branches/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listBranches: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  getCurrentBranchName: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  rtGetCurrentRefShadowV1: vi.fn(),
  rtSetCurrentRefShadowV1: vi.fn(),
  rtListRefsShadowV1: vi.fn()
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

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtGetCurrentRefShadowV1: mocks.rtGetCurrentRefShadowV1,
  rtSetCurrentRefShadowV1: mocks.rtSetCurrentRefShadowV1
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV1: mocks.rtListRefsShadowV1
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
    process.env.RT_SHADOW_WRITE = 'false';
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
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });
    mocks.rtListRefsShadowV1.mockResolvedValue([
      { name: 'main', headCommit: '', nodeCount: 2, isTrunk: true },
      { name: 'feature', headCommit: '', nodeCount: 0, isTrunk: false }
    ]);

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

  it('switches branch', async () => {
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 2, isTrunk: false }
    ]);
    const res = await PATCH(createRequest({ name: 'feature' }, 'PATCH'), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.switchBranch).toHaveBeenCalledWith('project-1', 'feature');
  });

  it('prefers per-user current branch when RT_SHADOW_WRITE=true', async () => {
    process.env.RT_SHADOW_WRITE = 'true';
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'feature' });

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.currentBranch).toBe('feature');
  });

  it('sets per-user current branch on PATCH when RT_SHADOW_WRITE=true', async () => {
    process.env.RT_SHADOW_WRITE = 'true';
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 2, isTrunk: false }
    ]);
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });
    mocks.rtSetCurrentRefShadowV1.mockResolvedValue(undefined);

    const res = await PATCH(createRequest({ name: 'feature' }, 'PATCH'), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.rtSetCurrentRefShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', refName: 'feature' });
    expect(mocks.switchBranch).not.toHaveBeenCalled();
  });

  it('falls back to git switchBranch if prefs update fails', async () => {
    process.env.RT_SHADOW_WRITE = 'true';
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 1, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 2, isTrunk: false }
    ]);
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });
    mocks.rtSetCurrentRefShadowV1.mockRejectedValue(new Error('pg down'));

    const res = await PATCH(createRequest({ name: 'feature' }, 'PATCH'), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.switchBranch).toHaveBeenCalledWith('project-1', 'feature');
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
