// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { ForgotPasswordForm } from './ForgotPasswordForm';
import { APP_NAME } from '@/src/config/app';

function sanitizeRedirectTo(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

export default function ForgotPasswordPage({ searchParams }: { searchParams?: { redirectTo?: string } }) {
  const redirectTo = sanitizeRedirectTo(searchParams?.redirectTo ?? null);

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-sm">
        <div className="mb-8">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{APP_NAME}</p>
          <h2 className="mt-2 text-lg font-medium text-slate-600">Password reset</h2>
        </div>
        <ForgotPasswordForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}

