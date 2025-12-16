import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/edit/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getCurrentBranchName: vi.fn(),
  createBranch: vi.fn(),
  appendNode: vi.fn(),
  getCommitHashForNode: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/utils', () => ({
  getCurrentBranchName: mocks.getCurrentBranchName,
  getCommitHashForNode: mocks.getCommitHashForNode
}));

vi.mock('@git/branches', () => ({
  createBranch: mocks.createBranch
}));

vi.mock('@git/nodes', () => ({
  appendNode: mocks.appendNode
}));

const baseUrl = 'http://localhost/api/projects/project-1/edit';

function createRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/edit', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getCurrentBranchName.mockResolvedValue('main');
    mocks.getCommitHashForNode.mockResolvedValue('commit-hash');
    mocks.appendNode.mockResolvedValue({ id: 'node-1', type: 'message' });
  });

  it('creates edit branch and appends node', async () => {
    const res = await POST(createRequest({ content: 'Edited message', branchName: 'edit-123', fromRef: 'main', nodeId: 'node-5' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(201);
    expect(mocks.getCommitHashForNode).toHaveBeenCalledWith('project-1', 'main', 'node-5');
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', 'edit-123', 'commit-hash');
    expect(mocks.appendNode).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ content: 'Edited message' }),
      expect.objectContaining({ ref: 'edit-123' })
    );
  });

  it('uses default branch name and current ref when not provided', async () => {
    mocks.getCurrentBranchName.mockResolvedValueOnce('feature/foo');
    const res = await POST(createRequest({ content: 'Default branch', nodeId: 'node-1' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(201);
    expect(mocks.createBranch).toHaveBeenCalledWith('project-1', expect.stringMatching(/^edit-/), 'commit-hash');
  });

  it('validates body', async () => {
    const res = await POST(createRequest({ content: '', nodeId: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await POST(createRequest({ content: 'X' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });
});
