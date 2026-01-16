// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { z } from 'zod';
import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectOwner } from '@/src/server/authz';

interface RouteContext {
  params: { id: string };
}

const inviteSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(['viewer', 'editor'])
});

const updateSchema = z.object({
  type: z.enum(['member', 'invite']),
  id: z.string().min(1),
  role: z.enum(['viewer', 'editor'])
});

const removeSchema = z.object({
  type: z.enum(['member', 'invite']),
  id: z.string().min(1)
});

async function loadMembers(projectId: string) {
  const { rtListProjectMembersShadowV1, rtListProjectInvitesShadowV1 } = await import('@/src/store/pg/members');
  const [members, invites] = await Promise.all([
    rtListProjectMembersShadowV1({ projectId }),
    rtListProjectInvitesShadowV1({ projectId })
  ]);
  return { members, invites };
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only supported in Postgres mode');
    }
    await requireUser();
    await requireProjectOwner({ id: params.id });

    const data = await loadMembers(params.id);
    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only supported in Postgres mode');
    }
    await requireUser();
    await requireProjectOwner({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { rtInviteProjectMemberShadowV1 } = await import('@/src/store/pg/members');
    await rtInviteProjectMemberShadowV1({
      projectId: params.id,
      email: parsed.data.email,
      role: parsed.data.role
    });

    const data = await loadMembers(params.id);
    return Response.json(data, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only supported in Postgres mode');
    }
    await requireUser();
    await requireProjectOwner({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    if (parsed.data.type === 'member') {
      const { rtUpdateProjectMemberRoleShadowV1 } = await import('@/src/store/pg/members');
      await rtUpdateProjectMemberRoleShadowV1({
        projectId: params.id,
        userId: parsed.data.id,
        role: parsed.data.role
      });
    } else {
      const { rtUpdateProjectInviteRoleShadowV1 } = await import('@/src/store/pg/members');
      await rtUpdateProjectInviteRoleShadowV1({
        projectId: params.id,
        inviteId: parsed.data.id,
        role: parsed.data.role
      });
    }

    const data = await loadMembers(params.id);
    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const store = getStoreConfig();
    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only supported in Postgres mode');
    }
    await requireUser();
    await requireProjectOwner({ id: params.id });

    const body = await request.json().catch(() => null);
    const parsed = removeSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    if (parsed.data.type === 'member') {
      const { rtRemoveProjectMemberShadowV1 } = await import('@/src/store/pg/members');
      await rtRemoveProjectMemberShadowV1({ projectId: params.id, userId: parsed.data.id });
    } else {
      const { rtRevokeProjectInviteShadowV1 } = await import('@/src/store/pg/members');
      await rtRevokeProjectInviteShadowV1({ projectId: params.id, inviteId: parsed.data.id });
    }

    const data = await loadMembers(params.id);
    return Response.json(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
