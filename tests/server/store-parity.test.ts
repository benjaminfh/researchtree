// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET as GETProjects } from '@/app/api/projects/route';
import { GET as GETBranches } from '@/app/api/projects/[id]/branches/route';
import { GET as GETHistory } from '@/app/api/projects/[id]/history/route';

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  rtListProjectMemberIdsShadowV1: vi.fn(),
  rtListProjectsShadowV1: vi.fn(),
  getProject: vi.fn(),
  listBranches: vi.fn(),
  getCurrentBranchName: vi.fn(),
  rtGetCurrentRefShadowV1: vi.fn(),
  rtListRefsShadowV1: vi.fn(),
  readNodesFromRef: vi.fn(),
  rtGetHistoryShadowV1: vi.fn()
}));

vi.mock('@git/projects', () => ({
  listProjects: mocks.listProjects,
  getProject: mocks.getProject
}));

vi.mock('@/src/store/pg/members', () => ({
  rtListProjectMemberIdsShadowV1: mocks.rtListProjectMemberIdsShadowV1
}));

vi.mock('@/src/store/pg/projects', () => ({
  rtListProjectsShadowV1: mocks.rtListProjectsShadowV1
}));

vi.mock('@git/branches', () => ({
  listBranches: mocks.listBranches
}));

vi.mock('@git/utils', () => ({
  getCurrentBranchName: mocks.getCurrentBranchName,
  readNodesFromRef: mocks.readNodesFromRef
}));

vi.mock('@/src/store/pg/prefs', () => ({
  rtGetCurrentRefShadowV1: mocks.rtGetCurrentRefShadowV1
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtListRefsShadowV1: mocks.rtListRefsShadowV1,
  rtGetHistoryShadowV1: mocks.rtGetHistoryShadowV1
}));

function normalizeProjects(projects: Array<{ id: string; name: string; description?: string; createdAt: string }>) {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description ?? undefined,
    createdAt: project.createdAt
  }));
}

function normalizeBranches(branches: Array<{ name: string; nodeCount: number; isTrunk: boolean }>) {
  return branches.map((branch) => ({
    name: branch.name,
    nodeCount: branch.nodeCount,
    isTrunk: branch.isTrunk
  }));
}

describe('store parity regression', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('projects list returns consistent shape for git and pg', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'p1', name: 'Project', description: null, createdAt: '2025-01-01T00:00:00.000Z' }
    ]);
    mocks.rtListProjectMemberIdsShadowV1.mockResolvedValue(['p1']);
    mocks.rtListProjectsShadowV1.mockResolvedValue([
      { id: 'p1', name: 'Project', description: null, createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }
    ]);

    process.env.RT_STORE = 'git';
    const gitRes = await GETProjects();
    const gitBody = await gitRes.json();

    process.env.RT_STORE = 'pg';
    const pgRes = await GETProjects();
    const pgBody = await pgRes.json();

    expect(normalizeProjects(gitBody.projects)).toEqual(normalizeProjects(pgBody.projects));
  });

  it('branches list returns consistent shape for git and pg', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1' });
    mocks.listBranches.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 2, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 1, isTrunk: false }
    ]);
    mocks.getCurrentBranchName.mockResolvedValue('main');
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'main' });
    mocks.rtListRefsShadowV1.mockResolvedValue([
      { name: 'main', headCommit: 'a', nodeCount: 2, isTrunk: true },
      { name: 'feature', headCommit: 'b', nodeCount: 1, isTrunk: false }
    ]);

    process.env.RT_STORE = 'git';
    const gitRes = await GETBranches(new Request('http://localhost/api/projects/p1/branches'), { params: { id: 'p1' } });
    const gitBody = await gitRes.json();

    process.env.RT_STORE = 'pg';
    const pgRes = await GETBranches(new Request('http://localhost/api/projects/p1/branches'), { params: { id: 'p1' } });
    const pgBody = await pgRes.json();

    expect(gitBody.currentBranch).toBe(pgBody.currentBranch);
    expect(normalizeBranches(gitBody.branches)).toEqual(normalizeBranches(pgBody.branches));
  });

  it('history returns consistent nodes for git and pg', async () => {
    const nodes = [
      { id: 'n1', type: 'message', role: 'user', content: 'Hello', timestamp: 1, parent: null },
      { id: 'n2', type: 'state', content: 'Hidden', timestamp: 2, parent: 'n1' },
      { id: 'n3', type: 'message', role: 'assistant', content: 'Hi', timestamp: 3, parent: 'n1', rawResponse: { foo: 'bar' } }
    ];

    mocks.getProject.mockResolvedValue({ id: 'p1' });
    mocks.readNodesFromRef.mockResolvedValue(nodes);
    mocks.rtGetCurrentRefShadowV1.mockResolvedValue({ refName: 'main' });
    mocks.rtGetHistoryShadowV1.mockResolvedValue(nodes.map((node, ordinal) => ({ ordinal, nodeJson: node })));

    process.env.RT_STORE = 'git';
    const gitRes = await GETHistory(new Request('http://localhost/api/projects/p1/history'), { params: { id: 'p1' } });
    const gitBody = await gitRes.json();

    process.env.RT_STORE = 'pg';
    const pgRes = await GETHistory(new Request('http://localhost/api/projects/p1/history'), { params: { id: 'p1' } });
    const pgBody = await pgRes.json();

    expect(pgBody.nodes).toEqual(gitBody.nodes);
  });
});
