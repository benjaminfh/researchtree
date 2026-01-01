// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/projects/[id]/artefact/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getArtefactFromRef: vi.fn(),
  readNodesFromRef: vi.fn(),
  rtGetCanvasShadowV2: vi.fn(),
  resolveRefByName: vi.fn(),
  resolveCurrentRef: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/artefact', () => ({
  getArtefactFromRef: mocks.getArtefactFromRef
}));

vi.mock('@git/utils', () => ({
  readNodesFromRef: mocks.readNodesFromRef
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetCanvasShadowV2: mocks.rtGetCanvasShadowV2
}));

vi.mock('@/src/server/pgRefs', () => ({
  resolveRefByName: mocks.resolveRefByName,
  resolveCurrentRef: mocks.resolveCurrentRef
}));

const baseUrl = 'http://localhost/api/projects/project-1/artefact';

describe('/api/projects/[id]/artefact', () => {
  beforeEach(() => {
    mocks.getProject.mockReset();
    mocks.getArtefactFromRef.mockReset();
    mocks.readNodesFromRef.mockReset();
    mocks.rtGetCanvasShadowV2.mockReset();
    mocks.resolveRefByName.mockReset();
    mocks.resolveCurrentRef.mockReset();
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-main', name: 'main' });
    process.env.RT_STORE = 'git';
  });

  it('returns artefact content with last state metadata', async () => {
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getArtefactFromRef.mockResolvedValue('# Artefact content');
    mocks.readNodesFromRef.mockResolvedValue([
      { id: '1', type: 'message', role: 'user', content: 'hi', timestamp: 1, parent: null },
      { id: '2', type: 'state', artefactSnapshot: 'abc', timestamp: 2, parent: '1' }
    ]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.getArtefactFromRef).toHaveBeenCalledWith('project-1', 'main');
    expect(mocks.readNodesFromRef).toHaveBeenCalledWith('project-1', 'main');
    const data = await res.json();
    expect(data.artefact).toContain('Artefact');
    expect(data.lastStateNodeId).toBe('2');
    expect(data.lastUpdatedAt).toBe(2);
  });

  it('handles missing state nodes', async () => {
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getArtefactFromRef.mockResolvedValue('');
    mocks.readNodesFromRef.mockResolvedValue([]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.lastStateNodeId).toBeNull();
  });

  it('returns artefact content for a specific ref', async () => {
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getArtefactFromRef.mockResolvedValue('# Branch artefact');
    mocks.readNodesFromRef.mockResolvedValue([
      { id: '10', type: 'state', artefactSnapshot: 'branch', timestamp: 123, parent: null }
    ]);

    const url = `${baseUrl}?ref=feature/foo`;
    const res = await GET(new Request(url), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.getArtefactFromRef).toHaveBeenCalledWith('project-1', 'feature/foo');
    expect(mocks.readNodesFromRef).toHaveBeenCalledWith('project-1', 'feature/foo');
    const data = await res.json();
    expect(data.artefact).toContain('Branch artefact');
    expect(data.lastStateNodeId).toBe('10');
  });

  it('returns 404 for missing project', async () => {
    mocks.getProject.mockResolvedValue(null);
    const res = await GET(new Request(baseUrl), { params: { id: 'missing' } });
    expect(res.status).toBe(404);
  });

  it('uses Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCanvasShadowV2.mockResolvedValue({
      content: '# Draft canvas',
      contentHash: 'abc',
      updatedAt: '2020-01-01T00:00:01.000Z',
      source: 'draft'
    });

    const res = await GET(new Request(`${baseUrl}?ref=main`), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(mocks.rtGetCanvasShadowV2).toHaveBeenCalledWith({ projectId: 'project-1', refId: 'ref-main' });
    expect(mocks.getArtefactFromRef).not.toHaveBeenCalled();
    expect(data.artefact).toBe('# Draft canvas');
    expect(data.lastUpdatedAt).toBe(Date.parse('2020-01-01T00:00:01.000Z'));
  });

  it('returns 500 when Postgres read fails in RT_STORE=pg mode', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetCanvasShadowV2.mockRejectedValue(new Error('pg down'));

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(500);
    expect(mocks.getArtefactFromRef).not.toHaveBeenCalled();
  });
});
