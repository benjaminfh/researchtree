// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { NextResponse } from 'next/server';
import { badRequest, handleRouteError } from '@/src/server/http';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireUser } from '@/src/server/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      throw badRequest('Missing project id');
    }

    const user = await requireUser();
    const store = getStoreConfig();

    if (store.mode === 'pg' && user.email) {
      const { rtAcceptProjectInvitesShadowV1 } = await import('@/src/store/pg/members');
      await rtAcceptProjectInvitesShadowV1({ email: user.email });
    }

    return NextResponse.redirect(new URL(`/projects/${projectId}`, url.origin), { status: 303 });
  } catch (error) {
    return handleRouteError(error);
  }
}
