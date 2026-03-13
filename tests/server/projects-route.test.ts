// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/projects/route';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  initProject: vi.fn(),
  deleteProject: vi.fn(),
  rtCreateProjectShadow: vi.fn(),
  rtListProjectsShadowV1: vi.fn(),
  rtGetProjectShadowV1: vi.fn(),
  rtListProjectMemberIdsShadowV1: vi.fn(),
  rtAcceptProjectInvitesShadowV1: vi.fn(),
  rtGetUserSystemPromptV1: vi.fn(),
  rtGetUserLlmKeyStatusV1: vi.fn()
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
  rtListProjectMemberIdsShadowV1: mocks.rtListProjectMemberIdsShadowV1,
  rtAcceptProjectInvitesShadowV1: mocks.rtAcceptProjectInvitesShadowV1
}));

vi.mock('@/src/store/pg/userSystemPrompt', () => ({
  rtGetUserSystemPromptV1: mocks.rtGetUserSystemPromptV1
}));

vi.mock('@/src/store/pg/userLlmKeys', () => ({
  rtGetUserLlmKeyStatusV1: mocks.rtGetUserLlmKeyStatusV1
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
    mocks.rtAcceptProjectInvitesShadowV1.mockReset();
    mocks.rtGetUserSystemPromptV1.mockReset();
    mocks.rtGetUserLlmKeyStatusV1.mockReset();
    delete process.env.LLM_ENABLE_OPENAI;
    delete process.env.LLM_ENABLE_GEMINI;
    delete process.env.LLM_ENABLE_ANTHROPIC;
    delete process.env.OPENAI_USE_RESPONSES;
    delete process.env.OPENAI_MODEL;
    delete process.env.LLM_ALLOWED_MODELS_OPENAI;
    process.env.RT_STORE = 'git';
    mocks.rtListProjectMemberIdsShadowV1.mockResolvedValue(['1']);
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: '1' });
    mocks.rtAcceptProjectInvitesShadowV1.mockResolvedValue([]);
    mocks.rtGetUserSystemPromptV1.mockResolvedValue({ mode: 'append', prompt: null });
    mocks.rtGetUserLlmKeyStatusV1.mockResolvedValue({
      hasOpenAI: false,
      hasGemini: false,
      hasAnthropic: false,
      defaultProvider: null,
      systemPrompt: null,
      systemPromptMode: 'append',
      updatedAt: null
    });
    delete process.env.LLM_ENABLED_PROVIDERS;
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
        createdAt: '2025-01-01T00:00:00.000Z',
        ownerUserId: null,
        ownerEmail: null,
        isOwner: false
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
      model: 'gpt-5.2',
      systemPrompt: expect.any(String)
    });
  });

  it('creates project with explicit provider when enabled', async () => {
    process.env.RT_STORE = 'pg';
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,gemini';
    mocks.rtCreateProjectShadow.mockResolvedValue({ projectId: 'p1' });
    mocks.rtGetProjectShadowV1.mockResolvedValue({
      id: 'p1',
      name: 'PG',
      description: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z'
    });

    const response = await POST(createRequest('POST', { name: 'PG', provider: 'gemini' }));
    expect(response.status).toBe(201);
    expect(mocks.rtCreateProjectShadow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'PG',
        provider: 'gemini',
        model: expect.any(String)
      })
    );
  });

  it('rejects project creation when explicit provider is disabled', async () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses';

    const response = await POST(createRequest('POST', { name: 'PG', provider: 'gemini' }));
    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body?.error?.message).toMatch(/provider "gemini" is not available/i);
  });
});
