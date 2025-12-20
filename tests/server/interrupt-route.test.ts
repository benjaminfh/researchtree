import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/interrupt/route';

const mocks = vi.hoisted(() => ({
  abortStream: vi.fn(),
  getProject: vi.fn(),
  requireProjectAccess: vi.fn()
}));

vi.mock('@/src/server/stream-registry', () => ({
  abortStream: mocks.abortStream
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectAccess: mocks.requireProjectAccess
}));

const baseUrl = 'http://localhost/api/projects/project-1/interrupt';

describe('/api/projects/[id]/interrupt', () => {
  beforeEach(() => {
    mocks.abortStream.mockReset();
    mocks.getProject.mockReset();
    mocks.requireProjectAccess.mockReset();
    mocks.getProject.mockResolvedValue({ id: 'project-1', name: 'Test' });
  });

  it('aborts active stream', async () => {
    mocks.abortStream.mockReturnValue(true);
    const res = await POST(new Request(baseUrl, { method: 'POST' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.aborted).toBe(true);
    expect(mocks.abortStream).toHaveBeenCalledWith('project-1', undefined);
  });

  it('handles missing stream', async () => {
    mocks.abortStream.mockReturnValue(false);
    const res = await POST(new Request(baseUrl, { method: 'POST' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.aborted).toBe(false);
  });

  it('passes ref when provided', async () => {
    mocks.abortStream.mockReturnValue(true);
    const req = new Request(`${baseUrl}?ref=feature%2Fone`, { method: 'POST' });
    const res = await POST(req, { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.abortStream).toHaveBeenCalledWith('project-1', 'feature/one');
  });
});
