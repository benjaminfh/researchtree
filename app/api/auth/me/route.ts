// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ user: { id: user.id, email: user.email ?? null } });
  } catch (error) {
    return handleRouteError(error);
  }
}
