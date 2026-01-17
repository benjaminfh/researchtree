// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST, PATCH, DELETE } from '@/app/api/projects/[id]/members/route';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireProjectOwner: vi.fn(),
  rtListProjectMembersShadowV1: vi.fn(),
  rtListProjectInvitesShadowV1: vi.fn(),
  rtInviteProjectMemberShadowV1: vi.fn(),
  rtUpdateProjectMemberRoleShadowV1: vi.fn(),
  rtUpdateProjectInviteRoleShadowV1: vi.fn(),
  rtRemoveProjectMemberShadowV1: vi.fn(),
  rtRevokeProjectInviteShadowV1: vi.fn()
}));

vi.mock('@/src/server/auth', () => ({
  requireUser: mocks.requireUser
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectOwner: mocks.requireProjectOwner
}));

vi.mock('@/src/store/pg/members', () => ({
  rtListProjectMembersShadowV1: mocks.rtListProjectMembersShadowV1,
  rtListProjectInvitesShadowV1: mocks.rtListProjectInvitesShadowV1,
  rtInviteProjectMemberShadowV1: mocks.rtInviteProjectMemberShadowV1,
  rtUpdateProjectMemberRoleShadowV1: mocks.rtUpdateProjectMemberRoleShadowV1,
  rtUpdateProjectInviteRoleShadowV1: mocks.rtUpdateProjectInviteRoleShadowV1,
  rtRemoveProjectMemberShadowV1: mocks.rtRemoveProjectMemberShadowV1,
  rtRevokeProjectInviteShadowV1: mocks.rtRevokeProjectInviteShadowV1
}));

const baseUrl = 'http://localhost/api/projects/project-1/members';

function createRequest(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  return new Request(baseUrl, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

describe('/api/projects/[id]/members', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireUser.mockResolvedValue({ id: 'user-1' });
    mocks.requireProjectOwner.mockResolvedValue({ id: 'project-1' });
    mocks.rtListProjectMembersShadowV1.mockResolvedValue([]);
    mocks.rtListProjectInvitesShadowV1.mockResolvedValue([]);
    process.env.RT_STORE = 'pg';
  });

  it('returns members and invites', async () => {
    mocks.rtListProjectMembersShadowV1.mockResolvedValueOnce([
      { userId: 'u1', email: 'owner@example.com', role: 'owner', createdAt: '2025-01-01T00:00:00.000Z' }
    ]);
    mocks.rtListProjectInvitesShadowV1.mockResolvedValueOnce([
      {
        id: 'i1',
        email: 'invitee@example.com',
        role: 'viewer',
        invitedBy: 'u1',
        invitedByEmail: 'owner@example.com',
        createdAt: '2025-01-02T00:00:00.000Z'
      }
    ]);

    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toHaveLength(1);
    expect(json.invites).toHaveLength(1);
    expect(mocks.rtListProjectMembersShadowV1).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(mocks.rtListProjectInvitesShadowV1).toHaveBeenCalledWith({ projectId: 'project-1' });
  });

  it('creates an invite and reloads members', async () => {
    mocks.rtInviteProjectMemberShadowV1.mockResolvedValueOnce({ inviteId: 'i2', memberUserId: null });

    const res = await POST(createRequest('POST', { email: 'invitee@example.com', role: 'editor' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(201);
    expect(mocks.rtInviteProjectMemberShadowV1).toHaveBeenCalledWith({
      projectId: 'project-1',
      email: 'invitee@example.com',
      role: 'editor'
    });
    expect(mocks.rtListProjectMembersShadowV1).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(mocks.rtListProjectInvitesShadowV1).toHaveBeenCalledWith({ projectId: 'project-1' });
  });

  it('rejects invalid invite payloads', async () => {
    const res = await POST(createRequest('POST', { email: 'bad', role: 'viewer' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(400);
  });

  it('updates member role', async () => {
    const res = await PATCH(createRequest('PATCH', { type: 'member', id: 'u1', role: 'editor' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(200);
    expect(mocks.rtUpdateProjectMemberRoleShadowV1).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'u1',
      role: 'editor'
    });
  });

  it('updates invite role', async () => {
    const res = await PATCH(createRequest('PATCH', { type: 'invite', id: 'i1', role: 'viewer' }), {
      params: { id: 'project-1' }
    });
    expect(res.status).toBe(200);
    expect(mocks.rtUpdateProjectInviteRoleShadowV1).toHaveBeenCalledWith({
      projectId: 'project-1',
      inviteId: 'i1',
      role: 'viewer'
    });
  });

  it('removes members and revokes invites', async () => {
    const memberRes = await DELETE(createRequest('DELETE', { type: 'member', id: 'u2' }), {
      params: { id: 'project-1' }
    });
    expect(memberRes.status).toBe(200);
    expect(mocks.rtRemoveProjectMemberShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', userId: 'u2' });

    const inviteRes = await DELETE(createRequest('DELETE', { type: 'invite', id: 'i2' }), {
      params: { id: 'project-1' }
    });
    expect(inviteRes.status).toBe(200);
    expect(mocks.rtRevokeProjectInviteShadowV1).toHaveBeenCalledWith({ projectId: 'project-1', inviteId: 'i2' });
  });

  it('rejects collaboration requests in git mode', async () => {
    process.env.RT_STORE = 'git';
    const res = await GET(new Request(baseUrl), { params: { id: 'project-1' } });
    expect(res.status).toBe(400);
  });
});
