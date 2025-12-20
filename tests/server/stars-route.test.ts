import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/[id]/stars/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getStarredNodeIds: vi.fn(),
  toggleStar: vi.fn(),
  rtGetStarredNodeIdsShadowV1: vi.fn(),
  rtToggleStarV1: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/stars', () => ({
  getStarredNodeIds: mocks.getStarredNodeIds,
  toggleStar: mocks.toggleStar
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetStarredNodeIdsShadowV1: mocks.rtGetStarredNodeIdsShadowV1
}));

vi.mock('@/src/store/pg/stars', () => ({
  rtToggleStarV1: mocks.rtToggleStarV1
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
    mocks.rtGetStarredNodeIdsShadowV1.mockResolvedValue(['11111111-1111-1111-1111-111111111111']);
    mocks.rtToggleStarV1.mockResolvedValue(['11111111-1111-1111-1111-111111111111']);
    process.env.RT_STORE = 'git';
  });

  it('returns starred node ids', async () => {
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.starredNodeIds).toEqual(['11111111-1111-1111-1111-111111111111']);
  });

  it('uses Postgres stars when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.starredNodeIds).toEqual(['11111111-1111-1111-1111-111111111111']);
    expect(mocks.rtGetStarredNodeIdsShadowV1).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(mocks.getStarredNodeIds).not.toHaveBeenCalled();
  });

  it('toggles star via Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtToggleStarV1.mockResolvedValueOnce(['22222222-2222-2222-2222-222222222222']);
    const res = await POST(createRequest({ nodeId: '22222222-2222-2222-2222-222222222222' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.starredNodeIds).toEqual(['22222222-2222-2222-2222-222222222222']);
    expect(mocks.rtToggleStarV1).toHaveBeenCalledWith({
      projectId: 'project-1',
      nodeId: '22222222-2222-2222-2222-222222222222'
    });
    expect(mocks.toggleStar).not.toHaveBeenCalled();
  });
});
