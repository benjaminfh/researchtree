// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/projects/[id]/merge/pin-canvas-diff/route';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getCurrentBranchName: vi.fn(),
  readNodesFromRef: vi.fn(),
  appendNodeToRefNoCheckout: vi.fn(),
  rtAppendNodeToRefShadowV2: vi.fn(),
  rtGetHistoryShadowV2: vi.fn(),
  resolveRefByName: vi.fn(),
  resolveCurrentRef: vi.fn()
}));
const authzMocks = vi.hoisted(() => ({
  requireProjectEditor: vi.fn()
}));

vi.mock('@git/projects', () => ({
  getProject: mocks.getProject
}));

vi.mock('@git/utils', () => ({
  getCurrentBranchName: mocks.getCurrentBranchName,
  readNodesFromRef: mocks.readNodesFromRef
}));

vi.mock('@git/nodes', () => ({
  appendNodeToRefNoCheckout: mocks.appendNodeToRefNoCheckout
}));

vi.mock('@/src/store/pg/nodes', () => ({
  rtAppendNodeToRefShadowV2: mocks.rtAppendNodeToRefShadowV2
}));

vi.mock('@/src/store/pg/reads', () => ({
  rtGetHistoryShadowV2: mocks.rtGetHistoryShadowV2
}));

vi.mock('@/src/server/pgRefs', () => ({
  resolveRefByName: mocks.resolveRefByName,
  resolveCurrentRef: mocks.resolveCurrentRef
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectEditor: authzMocks.requireProjectEditor
}));

const baseUrl = 'http://localhost/api/projects/project-1/merge/pin-canvas-diff';

function createRequest(body: Record<string, unknown>) {
  return new Request(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaseSessionId: 'lease-test', ...body })
  });
}

describe('/api/projects/[id]/merge/pin-canvas-diff', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    Object.values(authzMocks).forEach((mock) => mock.mockReset());
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getCurrentBranchName.mockResolvedValue('main');
    mocks.readNodesFromRef.mockResolvedValue([
      {
        id: 'merge-1',
        type: 'merge',
        mergeFrom: 'feature',
        mergeSummary: 'summary',
        sourceCommit: 'abc',
        sourceNodeIds: [],
        canvasDiff: '+added',
        timestamp: 1700000000000,
        parent: null
      }
    ]);
    mocks.appendNodeToRefNoCheckout.mockResolvedValue({
      id: 'pinned-1',
      type: 'message',
      role: 'assistant',
      content: '+added',
      pinnedFromMergeId: 'merge-1',
      timestamp: 1700000001000,
      parent: 'merge-1'
    });
    mocks.rtGetHistoryShadowV2.mockResolvedValue([]);
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });
    mocks.resolveCurrentRef.mockResolvedValue({ id: 'ref-main', name: 'main' });
    process.env.RT_STORE = 'git';
  });

  it('returns 404 when project missing', async () => {
    mocks.getProject.mockResolvedValueOnce(null);
    const res = await POST(createRequest({ mergeNodeId: 'merge-1' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(404);
  });

  it('validates body', async () => {
    const res = await POST(createRequest({ mergeNodeId: '' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when merge node not found', async () => {
    mocks.readNodesFromRef.mockResolvedValueOnce([]);
    const res = await POST(createRequest({ mergeNodeId: 'merge-1' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 400 when merge node has no canvas diff', async () => {
    mocks.readNodesFromRef.mockResolvedValueOnce([
      {
        id: 'merge-1',
        type: 'merge',
        mergeFrom: 'feature',
        mergeSummary: 'summary',
        sourceCommit: 'abc',
        sourceNodeIds: [],
        canvasDiff: '',
        timestamp: 1700000000000,
        parent: null
      }
    ]);
    const res = await POST(createRequest({ mergeNodeId: 'merge-1' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns an existing pinned node if already pinned', async () => {
    mocks.readNodesFromRef.mockResolvedValueOnce([
      {
        id: 'merge-1',
        type: 'merge',
        mergeFrom: 'feature',
        mergeSummary: 'summary',
        sourceCommit: 'abc',
        sourceNodeIds: [],
        canvasDiff: '+added',
        timestamp: 1700000000000,
        parent: null
      },
      {
        id: 'pinned-1',
        type: 'message',
        role: 'assistant',
        content: '+added',
        pinnedFromMergeId: 'merge-1',
        timestamp: 1700000001000,
        parent: 'merge-1'
      }
    ]);
    const res = await POST(createRequest({ mergeNodeId: 'merge-1' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.appendNodeToRefNoCheckout).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.alreadyPinned).toBe(true);
    expect(json.pinnedNode?.id).toBe('pinned-1');
  });

  it('pins the canvas diff as an assistant message on the target branch', async () => {
    const res = await POST(createRequest({ mergeNodeId: 'merge-1', targetBranch: 'main' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.getCurrentBranchName).not.toHaveBeenCalled();
    expect(mocks.appendNodeToRefNoCheckout).toHaveBeenCalledWith('project-1', 'main', {
      type: 'message',
      role: 'assistant',
      content: '+added',
      contentBlocks: [{ type: 'text', text: '+added' }],
      pinnedFromMergeId: 'merge-1'
    });
    const json = await res.json();
    expect(json.alreadyPinned).toBe(false);
    expect(json.pinnedNode?.id).toBe('pinned-1');
  });

  it('pins the canvas diff via Postgres when RT_STORE=pg', async () => {
    process.env.RT_STORE = 'pg';
    mocks.rtGetHistoryShadowV2.mockResolvedValueOnce([
      {
        ordinal: 0,
        nodeJson: {
          id: 'merge-1',
          type: 'merge',
          mergeFrom: 'feature',
          mergeSummary: 'summary',
          sourceCommit: 'abc',
          sourceNodeIds: [],
          canvasDiff: '+added',
          timestamp: 1700000000000,
          parent: null
        }
      }
    ]);
    mocks.rtAppendNodeToRefShadowV2.mockResolvedValue({
      newCommitId: 'c1',
      nodeId: 'pinned-1',
      ordinal: 0,
      artefactId: null,
      artefactContentHash: null
    });
    mocks.resolveRefByName.mockResolvedValue({ id: 'ref-main', name: 'main' });

    const res = await POST(createRequest({ mergeNodeId: 'merge-1', targetBranch: 'main' }), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    expect(mocks.rtAppendNodeToRefShadowV2).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', refId: 'ref-main' }));
    expect(mocks.appendNodeToRefNoCheckout).not.toHaveBeenCalled();
  });
});
