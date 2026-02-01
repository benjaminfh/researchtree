// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { ResetPasswordForm } from './ResetPasswordForm';
import { APP_NAME } from '@/src/config/app';

export const runtime = 'nodejs';

function sanitizeRedirectTo(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

export default function ResetPasswordPage({ searchParams }: { searchParams?: { redirectTo?: string } }) {
  const redirectTo = sanitizeRedirectTo(searchParams?.redirectTo ?? null);

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-sm">
        <div className="mb-8">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{APP_NAME}</p>
          <h2 className="mt-2 text-lg font-medium text-slate-600">Password reset</h2>
        </div>
        <ResetPasswordForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
