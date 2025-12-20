'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminUser } from '@/src/server/admin';
import { approveEmail, removeAllowlistEmail } from '@/src/server/waitlist';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function approveEmailAction(formData: FormData): Promise<void> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!email) return;

  const admin = await requireAdminUser();
  await approveEmail(email, admin.email ?? null);
  revalidatePath('/admin/waitlist');
}

export async function removeAllowlistEmailAction(formData: FormData): Promise<void> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!email) return;

  await requireAdminUser();
  await removeAllowlistEmail(email);
  revalidatePath('/admin/waitlist');
}

