import { forbidden } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminEmails(): Set<string> {
  const raw = process.env.RT_ADMIN_EMAILS ?? '';
  const emails = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeEmail);
  return new Set(emails);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().has(normalizeEmail(email));
}

export async function requireAdminUser() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    throw forbidden('Admin access required');
  }
  return user;
}
