// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import Link from 'next/link';
import { APP_NAME } from '@/src/config/app';
import { submitAccessCode, submitWaitlistRequest } from './actions';
import { WaitlistSubmitButton } from './WaitlistSubmitButton';

export const runtime = 'nodejs';

function sanitizeRedirectTo(input: string | null): string {
  if (!input) return '/waitlist';
  if (!input.startsWith('/')) return '/waitlist';
  if (input.startsWith('//')) return '/waitlist';
  return input;
}

export default function WaitlistPage({
  searchParams
}: {
  searchParams?: {
    requested?: string;
    codeApplied?: string;
    email?: string;
    redirectTo?: string;
    error?: string;
    blocked?: string;
  };
}) {
  const requested = (searchParams?.requested ?? '').trim() === '1';
  const codeApplied = (searchParams?.codeApplied ?? '').trim() === '1';
  const email = (searchParams?.email ?? '').trim();
  const error = (searchParams?.error ?? '').trim();
  const blocked = (searchParams?.blocked ?? '').trim() === '1';
  const redirectTo = sanitizeRedirectTo(searchParams?.redirectTo ?? null);

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-8">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{APP_NAME}</p>
          <h1 className="mt-2 text-lg font-medium text-slate-700">Request access</h1>
          <p className="mt-3 text-sm text-slate-600">Sign-ups are invite-only. Submit your email to join the waitlist.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</div> : null}
          {blocked ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Your account isn’t allowlisted yet. Request access or contact an admin to be whitelisted.
            </div>
          ) : null}
          {requested ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Request received{email ? ` for ${email}` : ''}. You’ll be able to sign up after you’re whitelisted.
            </div>
          ) : null}
          {codeApplied ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Access code applied{email ? ` for ${email}` : ''}. You can sign up now.
            </div>
          ) : null}

          <form action={submitWaitlistRequest} className="space-y-3">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <label className="block">
              <span className="text-sm font-medium text-slate-800">Email</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={email}
                required
              />
            </label>

            <WaitlistSubmitButton label="Request access" pendingLabel="Requesting…" />
          </form>

          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-800">Have an access code?</p>
            <form action={submitAccessCode} className="mt-3 space-y-3">
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <label className="block">
                <span className="text-sm font-medium text-slate-800">Email</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
                  name="email"
                  type="email"
                  autoComplete="email"
                  defaultValue={email}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-800">Access code</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
                  name="code"
                  type="text"
                  autoComplete="one-time-code"
                  required
                />
              </label>

              <WaitlistSubmitButton label="Apply access code" pendingLabel="Applying…" />
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login?mode=signIn#existing-user"
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
