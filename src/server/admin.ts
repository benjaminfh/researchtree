import { forbidden } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';

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
  const user = await requireUser();
  const adminIds = getAdminUserIds();
  if (!adminIds.has(user.id)) {
    throw forbidden('Admin access required');
  }
  return user;
}
