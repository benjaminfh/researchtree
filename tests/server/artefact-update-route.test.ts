import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from '@/app/api/projects/[id]/artefact/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getArtefact: vi.fn(),
  getArtefactFromRef: vi.fn(),
  getNodes: vi.fn(),
  readNodesFromRef: vi.fn(),
  updateArtefact: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/artefact', () => ({
  getArtefact: mocks.getArtefact,
  getArtefactFromRef: mocks.getArtefactFromRef,
  updateArtefact: mocks.updateArtefact
}));

vi.mock('@git/nodes', () => ({
  getNodes: mocks.getNodes
}));

vi.mock('@git/utils', () => ({
  readNodesFromRef: mocks.readNodesFromRef
}));

const baseUrl = 'http://localhost/api/projects/project-1/artefact?ref=main';

function createRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/projects/[id]/artefact PUT', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getArtefact.mockResolvedValue('# Artefact');
    mocks.getArtefactFromRef.mockResolvedValue('# Artefact');
    mocks.getNodes.mockResolvedValue([{ id: 'state1', type: 'state', timestamp: 1 }]);
    mocks.readNodesFromRef.mockResolvedValue([{ id: 'state1', type: 'state', timestamp: 1 }]);
    mocks.updateArtefact.mockResolvedValue(undefined);
  });

  it('updates artefact and returns metadata', async () => {
    const res = await PUT(createRequest({ content: 'New artefact' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.updateArtefact).toHaveBeenCalledWith('project-1', 'New artefact', 'main');
    const json = await res.json();
    expect(json.artefact).toBe('# Artefact');
    expect(json.lastStateNodeId).toBe('state1');
  });

  it('validates body', async () => {
    const res = await PUT(createRequest({ content: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await PUT(createRequest({ content: 'X' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });
});
