// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rtCreateProjectShadow, rtListProjectsShadowV1 } from '@/src/store/pg/projects';
import { rtAppendNodeToRefShadowV2 } from '@/src/store/pg/nodes';

const mocks = vi.hoisted(() => ({
  createLocalPgAdapter: vi.fn()
}));

vi.mock('@/src/store/pg/localAdapter', () => ({
  createLocalPgAdapter: mocks.createLocalPgAdapter
}));

const originalEnv = { ...process.env };

describe('local pg adapter integration (smoke)', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RT_PG_ADAPTER: 'local',
      LOCAL_PG_URL: 'postgresql://localhost:5432/test'
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    mocks.createLocalPgAdapter.mockReset();
    mocks.createLocalPgAdapter.mockReturnValue({
      rpc: async (fn: string) => {
        if (fn === 'rt_create_project') {
          return { data: 'proj-1', error: null };
        }
        if (fn === 'rt_list_projects_v1') {
          return {
            data: [
              {
                id: 'proj-1',
                name: 'Local',
                description: null,
                created_at: '2025-01-01T00:00:00Z',
                updated_at: null
              }
            ],
            error: null
          };
        }
        if (fn === 'rt_append_node_to_ref_v2') {
          return {
            data: [
              {
                new_commit_id: 'c1',
                node_id: 'n1',
                ordinal: 0,
                artefact_id: null,
                artefact_content_hash: null
              }
            ],
            error: null
          };
        }
        return { data: null, error: null };
      },
      adminRpc: async () => ({ data: null, error: null })
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('executes RPC wrappers through the local adapter', async () => {
    const created = await rtCreateProjectShadow({ name: 'Local Project' });
    expect(created.projectId).toBe('proj-1');

    const projects = await rtListProjectsShadowV1();
    expect(projects).toEqual([
      {
        id: 'proj-1',
        name: 'Local',
        description: undefined,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }
    ]);

    const appended = await rtAppendNodeToRefShadowV2({
      projectId: 'proj-1',
      refId: 'ref-1',
      kind: 'message',
      role: 'user',
      contentJson: { text: 'hello' }
    });
    expect(appended).toEqual({
      newCommitId: 'c1',
      nodeId: 'n1',
      ordinal: 0,
      artefactId: null,
      artefactContentHash: null
    });

    expect(mocks.createLocalPgAdapter).toHaveBeenCalledWith(expect.objectContaining({ bootstrap: expect.any(Function) }));
  });
});
