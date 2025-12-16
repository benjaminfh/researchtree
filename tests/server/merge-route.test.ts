import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/merge/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  mergeBranch: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/branches', () => ({
  mergeBranch: mocks.mergeBranch
}));

const baseUrl = 'http://localhost/api/projects/project-1/merge';

function createRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/merge', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.mergeBranch.mockResolvedValue({ id: 'merge-1', type: 'merge' });
  });

  it('merges a branch and returns merge node', async () => {
    const res = await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'bring back work' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(200);
    expect(mocks.mergeBranch).toHaveBeenCalledWith(
      'project-1',
      'feature',
      'bring back work',
      expect.objectContaining({ applyArtefact: false, targetBranch: undefined })
    );
    const json = await res.json();
    expect(json.mergeNode).toBeDefined();
  });

  it('passes targetBranch when provided', async () => {
    await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary', targetBranch: 'release' }), {
      params: { id: 'project-1' }
    });
    expect(mocks.mergeBranch).toHaveBeenCalledWith(
      'project-1',
      'feature',
      'summary',
      expect.objectContaining({ targetBranch: 'release' })
    );
  });

  it('passes applyArtefact flag', async () => {
    await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary', applyArtefact: true }), {
      params: { id: 'project-1' }
    });
    expect(mocks.mergeBranch).toHaveBeenCalledWith('project-1', 'feature', 'summary', {
      targetBranch: undefined,
      applyArtefact: true
    });
  });

  it('validates body', async () => {
    const res = await POST(createRequest({ sourceBranch: '', mergeSummary: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await POST(createRequest({ sourceBranch: 'feature', mergeSummary: 'summary' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });
});
