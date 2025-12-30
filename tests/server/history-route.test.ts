// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/projects/[id]/history/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  readNodesFromRef: vi.fn(),
  rtGetHistoryShadowV2: vi.fn(),
  resolveRefByName: vi.fn(),
  resolveCurrentRef: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/utils', () => ({
  readNodesFromRef: mocks.readNodesFromRef
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetHistoryShadowV2: mocks.rtGetHistoryShadowV2
}));

vi.mock('@/src/server/pgRefs', () => ({
  resolveRefByName: mocks.resolveRefByName,
  resolveCurrentRef: mocks.resolveCurrentRef
}));

const baseUrl = 'http://localhost/api/projects/project-1/history';

describe('/api/projects/[id]/history', () => {
  beforeEach(() => {
    mocks.getProject.mockReset();
    mocks.readNodesFromRef.mockReset();
    mocks.rtGetHistoryShadowV2.mockReset();
    mocks.resolveRefByName.mockReset();
    mocks.resolveCurrentRef.mockReset();
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-main', name: 'main' });
    process.env.RT_STORE = 'git';
  });

  it('returns nodes with optional limit', async () => {
    const nodes = [
      { id: '1', type: 'message', role: 'user', content: 'A', timestamp: Date.now(), parent: null },
      { id: '2', type: 'message', role: 'assistant', content: 'B', timestamp: Date.now(), parent: '1' },
      { id: '3', type: 'message', role: 'user', content: 'C', timestamp: Date.now(), parent: '2' }
    ];
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.readNodesFromRef.mockResolvedValue(nodes);

    const req = new Request(`${baseUrl}?limit=2`);
    const res = await GET(req, { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(mocks.readNodesFromRef).toHaveBeenCalledWith('project-1', 'main');
    expect(data.nodes).toHaveLength(2);
    expect(data.nodes[0].id).toBe('2');
    expect(data.nodes[1].id).toBe('3');
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValue(null);
    const res = await GET(new Request(baseUrl), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('uses Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetHistoryShadowV2.mockResolvedValue([
      { ordinal: 0, nodeJson: { id: '1', type: 'message', role: 'user', content: 'A', timestamp: 1, parent: null } },
      { ordinal: 1, nodeJson: { id: '2', type: 'state', artefactSnapshot: 'x', timestamp: 2, parent: '1' } },
      { ordinal: 2, nodeJson: { id: '3', type: 'message', role: 'assistant', content: 'B', timestamp: 3, parent: '1' } }
    ]);

    const req = new Request(`${baseUrl}?limit=50&ref=main`);
    const res = await GET(req, { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(mocks.rtGetHistoryShadowV2).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', refId: 'ref-main' }));
    expect(mocks.readNodesFromRef).not.toHaveBeenCalled();
    expect(data.nodes.map((n: any) => n.id)).toEqual(['1', '3']);
  });

  it('returns 500 when Postgres read fails in RT_STORE=pg mode', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetHistoryShadowV2.mockRejectedValue(new Error('pg down'));

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(500);
    expect(mocks.readNodesFromRef).not.toHaveBeenCalled();
  });
});
