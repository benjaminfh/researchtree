import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/[id]/stars/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getStarredNodeIds: vi.fn(),
  toggleStar: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  rtSyncStarsShadow: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/stars', () => ({
  getStarredNodeIds: mocks.getStarredNodeIds,
  toggleStar: mocks.toggleStar
}));

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow
}));

vi.mock('@/src/store/pg/stars', () => ({
  rtSyncStarsShadow: mocks.rtSyncStarsShadow
}));

const baseUrl = 'http://localhost/api/projects/project-1/stars';

function createRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/stars', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
    mocks.getStarredNodeIds.mockResolvedValue(['11111111-1111-1111-1111-111111111111']);
    mocks.toggleStar.mockResolvedValue(['11111111-1111-1111-1111-111111111111']);
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'project-1' });
    mocks.rtSyncStarsShadow.mockResolvedValue(undefined);
    process.env.RT_PG_SHADOW_WRITE = 'false';
  });

  it('returns starred node ids', async () => {
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.starredNodeIds).toEqual(['11111111-1111-1111-1111-111111111111']);
  });

  it('shadow-syncs stars on GET when RT_PG_SHADOW_WRITE=true', async () => {
    process.env.RT_PG_SHADOW_WRITE = 'true';
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.rtSyncStarsShadow).toHaveBeenCalledWith({
      projectId: 'project-1',
      nodeIds: ['11111111-1111-1111-1111-111111111111']
    });
  });

  it('toggles star in git and shadow-syncs on POST when RT_PG_SHADOW_WRITE=true', async () => {
    process.env.RT_PG_SHADOW_WRITE = 'true';
    mocks.toggleStar.mockResolvedValueOnce(['22222222-2222-2222-2222-222222222222']);
    const res = await POST(createRequest({ nodeId: '22222222-2222-2222-2222-222222222222' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.rtSyncStarsShadow).toHaveBeenCalledWith({
      projectId: 'project-1',
      nodeIds: ['22222222-2222-2222-2222-222222222222']
    });
  });
});

