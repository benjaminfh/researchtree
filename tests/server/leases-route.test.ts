// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/projects/[id]/leases/route';

const mocks = vi.hoisted(() => ({
  rtListRefLeasesShadowV1: vi.fn(),
  requireProjectAccess: vi.fn()
}));

vi.mock('@/src/store/pg/leases', () => ({
  rtListRefLeasesShadowV1: mocks.rtListRefLeasesShadowV1
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectAccess: mocks.requireProjectAccess
}));

const baseUrl = 'http://localhost/api/projects/project-1/leases';

describe('/api/projects/[id]/leases', () => {
  beforeEach(() => {
    mocks.rtListRefLeasesShadowV1.mockReset();
    mocks.requireProjectAccess.mockReset();
    process.env.RT_STORE = 'pg';
  });

  it('returns leases in Postgres mode', async () => {
    mocks.rtListRefLeasesShadowV1.mockResolvedValue([
      {
        refId: 'ref-1',
        holderUserId: 'user-1',
        holderSessionId: 'session-1',
        expiresAt: '2025-01-03T00:00:00.000Z',
        updatedAt: '2025-01-03T00:00:00.000Z'
      }
    ]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.leases).toHaveLength(1);
  });

  it('returns 400 when not in Postgres mode', async () => {
    process.env.RT_STORE = 'git';
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });
});
