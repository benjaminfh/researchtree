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

export async function approveEmailWithFeedbackAction(
  _prevState: { ok: boolean; error: string | null; email: string | null },
  formData: FormData
): Promise<{ ok: boolean; error: string | null; email: string | null }> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!email) {
    return { ok: false, error: 'Email is required.', email: null };
  }

  try {
    const admin = await requireAdminUser();
    await approveEmail(email, admin.email ?? null);
    revalidatePath('/admin/waitlist');
    return { ok: true, error: null, email };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approve failed.';
    return { ok: false, error: message, email: null };
  }
}

export async function removeAllowlistEmailAction(formData: FormData): Promise<void> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!email) return;

  await requireAdminUser();
  await removeAllowlistEmail(email);
  revalidatePath('/admin/waitlist');
}
