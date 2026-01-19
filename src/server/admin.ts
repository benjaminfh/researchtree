// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { forbidden } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { assertLocalPgModeConfig, isLocalPgMode } from '@/src/server/pgMode';
import { isPreviewDeployment } from '@/src/server/vercelEnv';

export function getAdminUserIds(): Set<string> {
  const raw = process.env.RT_ADMIN_USER_IDS ?? '';
  const ids = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(ids);
}

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getAdminUserIds().has(userId);
}

export async function requireAdminUser() {
  if (isLocalPgMode()) {
    assertLocalPgModeConfig();
    return requireUser();
  }
  if (isPreviewDeployment()) {
    return requireUser();
  }
  const user = await requireUser();
  const adminIds = getAdminUserIds();
  if (!adminIds.has(user.id)) {
    throw forbidden('Admin access required');
  }
  return user;
}
