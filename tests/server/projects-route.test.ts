import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/route';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  initProject: vi.fn(),
  deleteProject: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  createSupabaseServerClient: vi.fn()
}));

vi.mock('@git/projects', () => ({
  listProjects: mocks.listProjects,
  initProject: mocks.initProject,
  deleteProject: mocks.deleteProject
}));

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow
}));

vi.mock('@/src/server/supabase/server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
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
    mocks.deleteProject.mockReset();
    mocks.rtCreateProjectShadow.mockReset();
    mocks.createSupabaseServerClient.mockReset();
    process.env.RT_STORE = 'git';
    mocks.createSupabaseServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table !== 'project_members') {
          throw new Error(`Unexpected table: ${table}`);
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [{ project_id: '1' }],
              error: null
            }))
          }))
        };
      })
    });
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: '1' });
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

  it('creates Postgres project row on POST (rt_create_project)', async () => {
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

  it('lists projects from Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.createSupabaseServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: [{ id: 'p1', name: 'PG', description: null, created_at: '2025-01-01T00:00:00Z' }],
            error: null
          }))
        }))
      }))
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.projects).toEqual([
      {
        id: 'p1',
        name: 'PG',
        description: undefined,
        createdAt: '2025-01-01T00:00:00.000Z'
      }
    ]);
    expect(mocks.listProjects).not.toHaveBeenCalled();
  });

  it('creates project via Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'p1' });
    mocks.createSupabaseServerClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: 'p1', name: 'PG', description: 'd', created_at: '2025-01-01T00:00:00Z' },
              error: null
            }))
          }))
        }))
      }))
    });

    const response = await POST(createRequest('POST', { name: 'PG', description: 'd' }));
    expect(response.status).toBe(201);
    const data = (await response.json()) as any;
    expect(data).toEqual({
      id: 'p1',
      name: 'PG',
      description: 'd',
      createdAt: '2025-01-01T00:00:00.000Z'
    });
    expect(mocks.initProject).not.toHaveBeenCalled();
    expect(mocks.rtCreateProjectShadow).toHaveBeenCalledWith({ name: 'PG', description: 'd' });
  });
});
