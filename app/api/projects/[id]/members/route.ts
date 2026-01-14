// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { requireProjectAccess } from '@/src/server/authz';
import { getStoreConfig } from '@/src/server/storeConfig';
import { z } from 'zod';

interface RouteContext {
  params: { id: string };
}

const roleSchema = z.enum(['viewer', 'editor']);

const shareSchema = z.object({
  email: z.string().email(),
  role: roleSchema
});

const updateMemberSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema
});

const updateInviteSchema = z.object({
  inviteId: z.string().uuid(),
  role: roleSchema
});

const removeMemberSchema = z.object({
  userId: z.string().uuid()
});

const removeInviteSchema = z.object({
  inviteId: z.string().uuid()
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only available in Postgres mode.');
    }

    const { rtListProjectMembersShadowV1, rtListProjectInvitesShadowV1 } = await import('@/src/store/pg/collaboration');
    const [members, invites] = await Promise.all([
      rtListProjectMembersShadowV1({ projectId: params.id }),
      rtListProjectInvitesShadowV1({ projectId: params.id })
    ]);

    return Response.json({ members, invites });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only available in Postgres mode.');
    }

    const body = await request.json().catch(() => null);
    const parsed = shareSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { rtShareProjectByEmailShadowV1 } = await import('@/src/store/pg/collaboration');
    const shareResult = await rtShareProjectByEmailShadowV1({
      projectId: params.id,
      email: parsed.data.email,
      role: parsed.data.role
    });

    return Response.json({ share: shareResult });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only available in Postgres mode.');
    }

    const body = await request.json().catch(() => null);

    const memberParsed = updateMemberSchema.safeParse(body);
    if (memberParsed.success) {
      const { rtUpdateProjectMemberRoleShadowV1 } = await import('@/src/store/pg/collaboration');
      await rtUpdateProjectMemberRoleShadowV1({
        projectId: params.id,
        userId: memberParsed.data.userId,
        role: memberParsed.data.role
      });
      return Response.json({ ok: true });
    }

    const inviteParsed = updateInviteSchema.safeParse(body);
    if (inviteParsed.success) {
      const { rtUpdateProjectInviteRoleShadowV1 } = await import('@/src/store/pg/collaboration');
      await rtUpdateProjectInviteRoleShadowV1({
        projectId: params.id,
        inviteId: inviteParsed.data.inviteId,
        role: inviteParsed.data.role
      });
      return Response.json({ ok: true });
    }

    throw badRequest('Invalid request body');
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });

    if (store.mode !== 'pg') {
      throw badRequest('Collaboration is only available in Postgres mode.');
    }

    const body = await request.json().catch(() => null);

    const memberParsed = removeMemberSchema.safeParse(body);
    if (memberParsed.success) {
      const { rtRemoveProjectMemberShadowV1 } = await import('@/src/store/pg/collaboration');
      await rtRemoveProjectMemberShadowV1({
        projectId: params.id,
        userId: memberParsed.data.userId
      });
      return Response.json({ ok: true });
    }

    const inviteParsed = removeInviteSchema.safeParse(body);
    if (inviteParsed.success) {
      const { rtRemoveProjectInviteShadowV1 } = await import('@/src/store/pg/collaboration');
      await rtRemoveProjectInviteShadowV1({
        projectId: params.id,
        inviteId: inviteParsed.data.inviteId
      });
      return Response.json({ ok: true });
    }

    throw badRequest('Invalid request body');
  } catch (error) {
    return handleRouteError(error);
  }
}
