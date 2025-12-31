// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { requestPasswordReset } from './actions';

const initialState = { error: null as string | null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
    >
      {pending ? (
        <>
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
          <span>Sending…</span>
        </>
      ) : (
        'Send reset link'
      )}
    </button>
  );
}

export function ForgotPasswordForm({ redirectTo }: { redirectTo: string }) {
  const [state, action] = useFormState(requestPasswordReset, initialState);

  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Reset your password</h1>
      <p className="mt-2 text-sm text-slate-600">Enter your email and we’ll send a magic link to reset your password.</p>

      <form action={action} className="mt-6 space-y-3">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Email</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>

        {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

        <div className="flex items-center justify-between gap-3">
          <SubmitButton />
          <Link
            href={`/login?redirectTo=${encodeURIComponent(redirectTo)}&mode=signIn#existing-user`}
            className="text-sm text-slate-900 underline"
          >
            Back to sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
