import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/route';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  initProject: vi.fn(),
  rtCreateProjectShadow: vi.fn()
}));

vi.mock('@git/projects', () => ({
  listProjects: mocks.listProjects,
  initProject: mocks.initProject
}));

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow
}));

const baseUrl = 'http://localhost/api/projects';

function createRequest(method: string, body?: unknown) {
  return new Request(baseUrl, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

describe('/api/projects route', () => {
  beforeEach(() => {
    mocks.listProjects.mockReset();
    mocks.initProject.mockReset();
    mocks.rtCreateProjectShadow.mockReset();
    process.env.RT_PG_SHADOW_WRITE = 'false';
  });

  it('returns project list on GET', async () => {
    const projects = [{ id: '1', name: 'Test', createdAt: 'now' }];
    mocks.listProjects.mockResolvedValue(projects as any);

    const response = await GET();
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.projects).toEqual(projects);
  });

  it('creates project on POST', async () => {
    const project = { id: '1', name: 'Test', createdAt: 'now' };
    mocks.initProject.mockResolvedValue(project as any);

    const response = await POST(createRequest('POST', { name: 'Test' }));
    expect(response.status).toBe(201);
    const data = (await response.json()) as any;
    expect(data).toEqual(project);
  });

  it('shadow-writes project on POST when RT_PG_SHADOW_WRITE=true', async () => {
    process.env.RT_PG_SHADOW_WRITE = 'true';
    const project = { id: '1', name: 'Test', createdAt: 'now' };
    mocks.initProject.mockResolvedValue(project as any);
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: '1' });

    const response = await POST(createRequest('POST', { name: 'Test' }));
    expect(response.status).toBe(201);
    expect(mocks.rtCreateProjectShadow).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: '1', name: 'Test' })
    );
  });

  it('validates request body', async () => {
    const response = await POST(createRequest('POST', { name: '' }));
    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error.code).toBe('BAD_REQUEST');
  });
});
