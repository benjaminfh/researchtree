// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/projects/[id]/members/route';
import { forbidden } from '@/src/server/http';

const mocks = vi.hoisted(() => ({
  rtListProjectMembersShadowV1: vi.fn(),
  rtListProjectInvitesShadowV1: vi.fn(),
  requireProjectOwner: vi.fn()
}));

vi.mock('@/src/store/pg/members', () => ({
  rtListProjectMembersShadowV1: mocks.rtListProjectMembersShadowV1,
  rtListProjectInvitesShadowV1: mocks.rtListProjectInvitesShadowV1
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectOwner: mocks.requireProjectOwner
}));

const baseUrl = 'http://localhost/api/projects/project-1/members';

describe('/api/projects/[id]/members', () => {
  beforeEach(() => {
    mocks.rtListProjectMembersShadowV1.mockReset();
    mocks.rtListProjectInvitesShadowV1.mockReset();
    mocks.requireProjectOwner.mockReset();
    process.env.RT_STORE = 'pg';
  });

  it('returns members and invites in Postgres mode', async () => {
    mocks.rtListProjectMembersShadowV1.mockResolvedValue([
      { userId: 'user-1', role: 'owner', createdAt: '2025-01-01T00:00:00.000Z' }
    ]);
    mocks.rtListProjectInvitesShadowV1.mockResolvedValue([
      { email: 'invite@example.com', role: 'viewer', invitedByUserId: 'user-1', createdAt: '2025-01-02T00:00:00.000Z' }
    ]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toHaveLength(1);
    expect(json.invites).toHaveLength(1);
  });

  it('returns 400 when not in Postgres mode', async () => {
    process.env.RT_STORE = 'git';
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });

  it('returns 403 when owner check fails', async () => {
    mocks.requireProjectOwner.mockRejectedValue(forbidden('Not authorized'));
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(403);
  });
});
