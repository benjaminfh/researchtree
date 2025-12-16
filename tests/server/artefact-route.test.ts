import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/projects/[id]/artefact/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getArtefact: vi.fn(),
  getNodes: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/artefact', () => ({
  getArtefact: mocks.getArtefact
}));

vi.mock('@git/nodes', () => ({
  getNodes: mocks.getNodes
}));

const baseUrl = 'http://localhost/api/projects/project-1/artefact';

describe('/api/projects/[id]/artefact', () => {
  beforeEach(() => {
    mocks.getProject.mockReset();
    mocks.getArtefact.mockReset();
    mocks.getNodes.mockReset();
  });

  it('returns artefact content with last state metadata', async () => {
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getArtefact.mockResolvedValue('# Artefact content');
    mocks.getNodes.mockResolvedValue([
      { id: '1', type: 'message', role: 'user', content: 'hi', timestamp: 1, parent: null },
      { id: '2', type: 'state', artefactSnapshot: 'abc', timestamp: 2, parent: '1' }
    ]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.artefact).toContain('Artefact');
    expect(data.lastStateNodeId).toBe('2');
    expect(data.lastUpdatedAt).toBe(2);
  });

  it('handles missing state nodes', async () => {
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getArtefact.mockResolvedValue('');
    mocks.getNodes.mockResolvedValue([]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.lastStateNodeId).toBeNull();
  });

  it('returns 404 for missing project', async () => {
    mocks.getProject.mockResolvedValue(null);
    const res = await GET(new Request(baseUrl), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });
});
