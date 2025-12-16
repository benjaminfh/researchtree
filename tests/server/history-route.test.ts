import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/projects/[id]/history/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getNodes: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/nodes', () => ({
  getNodes: mocks.getNodes
}));

const baseUrl = 'http://localhost/api/projects/project-1/history';

describe('/api/projects/[id]/history', () => {
  beforeEach(() => {
    mocks.getProject.mockReset();
    mocks.getNodes.mockReset();
  });

  it('returns nodes with optional limit', async () => {
    const nodes = [
      { id: '1', type: 'message', role: 'user', content: 'A', timestamp: Date.now(), parent: null },
      { id: '2', type: 'message', role: 'assistant', content: 'B', timestamp: Date.now(), parent: '1' },
      { id: '3', type: 'message', role: 'user', content: 'C', timestamp: Date.now(), parent: '2' }
    ];
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getNodes.mockResolvedValue(nodes);

    const req = new Request(`${baseUrl}?limit=2`);
    const res = await GET(req, { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.nodes).toHaveLength(2);
    expect(data.nodes[0].id).toBe('2');
    expect(data.nodes[1].id).toBe('3');
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValue(null);
    const res = await GET(new Request(baseUrl), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });
});
