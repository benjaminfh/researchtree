// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/route';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  initProject: vi.fn(),
  deleteProject: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  rtListProjectsShadowV1: vi.fn(),
  rtGetProjectShadowV1: vi.fn(),
  rtListProjectMemberIdsShadowV1: vi.fn()
}));

vi.mock('@git/projects', () => ({
  listProjects: mocks.listProjects,
  initProject: mocks.initProject,
  deleteProject: mocks.deleteProject
}));

vi.mock('@/src/store/pg/projects', () => ({
  rtCreateProjectShadow: mocks.rtCreateProjectShadow,
  rtListProjectsShadowV1: mocks.rtListProjectsShadowV1,
  rtGetProjectShadowV1: mocks.rtGetProjectShadowV1
}));

vi.mock('@/src/store/pg/members', () => ({
  rtListProjectMemberIdsShadowV1: mocks.rtListProjectMemberIdsShadowV1
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
    mocks.rtListProjectsShadowV1.mockReset();
    mocks.rtGetProjectShadowV1.mockReset();
    mocks.rtListProjectMemberIdsShadowV1.mockReset();
    process.env.RT_STORE = 'git';
    mocks.rtListProjectMemberIdsShadowV1.mockResolvedValue(['1']);
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
      expect.objectContaining({ projectId: '1', name: 'Test', provider: 'openai_responses', model: 'gpt-5.2' })
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
    mocks.rtListProjectsShadowV1.mockResolvedValue([
      {
        id: 'p1',
        name: 'PG',
        description: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z'
      }
    ]);

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
    mocks.rtGetProjectShadowV1.mockResolvedValue({
      id: 'p1',
      name: 'PG',
      description: 'd',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z'
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
    expect(mocks.rtCreateProjectShadow).toHaveBeenCalledWith({
      name: 'PG',
      description: 'd',
      provider: 'openai_responses',
      model: 'gpt-5.2'
    });
  });
});
