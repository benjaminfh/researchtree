// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { signInWithPassword, signUpWithPassword } from './actions';
import Link from 'next/link';
import { useCommandEnterSubmit } from '@/src/hooks/useCommandEnterSubmit';
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_HINT } from '@/src/utils/passwordPolicy';

function SubmitButton({ label }: { label: string }) {
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
          <span>{label === 'Sign in' ? 'Signing in…' : label === 'Create account' ? 'Creating account…' : 'Working…'}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

const initialState = { error: null as string | null, mode: null as 'signIn' | 'signUp' | null };

export function LoginForm({
  redirectTo,
  initialEmail,
  waitlistEnforced,
  initialMode = 'signUp'
}: {
  redirectTo: string;
  initialEmail?: string | null;
  waitlistEnforced: boolean;
  initialMode?: 'signUp' | 'signIn';
}) {
  const [signInState, signInAction] = useFormState(signInWithPassword, initialState);
  const [signUpState, signUpAction] = useFormState(signUpWithPassword, initialState);
  const [mode, setMode] = useState<'signUp' | 'signIn'>(initialMode);
  const [emailValue, setEmailValue] = useState(initialEmail ?? '');
  const handleSignInCommandEnter = useCommandEnterSubmit();
  const handleSignUpCommandEnter = useCommandEnterSubmit();

  useEffect(() => {
    if (window.location.hash === '#existing-user') {
      setMode('signIn');
    }
  }, []);

  useEffect(() => {
    if (signUpState?.mode === 'signIn') {
      setMode('signIn');
    }
  }, [signUpState]);

  const activeError = useMemo(() => {
    const signInError = signInState?.error ?? null;
    const signUpError = signUpState?.error ?? null;
    if (mode === 'signIn') {
      if (signInError) return signInError;
      if (signUpState?.mode === 'signIn' && signUpError) return signUpError;
      return null;
    }
    return signUpError;
  }, [mode, signInState, signUpState]);

  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">{mode === 'signIn' ? 'Sign in' : 'Create an account'}</h1>

      {mode === 'signIn' ? (
        <form onKeyDown={handleSignInCommandEnter} action={signInAction} className="mt-6 space-y-3">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Email</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
              name="email"
              type="email"
              autoComplete="email"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Password</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          {activeError ? <p className="text-sm text-red-700">{activeError}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <SubmitButton label="Sign in" />
            <Link
              href={`/forgot-password?redirectTo=${encodeURIComponent(redirectTo)}`}
              className="text-sm text-slate-900 underline"
            >
              Forgot password?
            </Link>
          </div>
        </form>
      ) : (
        <form onKeyDown={handleSignUpCommandEnter} action={signUpAction} className="mt-6 space-y-3">
          <input type="hidden" name="redirectTo" value={redirectTo} />
          {waitlistEnforced ? (
            <p className="text-sm text-slate-600">
              Invite-only for now.{' '}
              <Link href="/waitlist" className="text-slate-900 underline">
                Request access
              </Link>
              .
            </p>
          ) : null}
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Email</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
              name="email"
              type="email"
              autoComplete="email"
              value={emailValue}
              onChange={(event) => setEmailValue(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Password</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              pattern={`(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{${PASSWORD_MIN_LENGTH},}`}
              title={PASSWORD_POLICY_HINT}
              required
            />
            <span className="mt-1 block text-xs text-slate-600">
              {PASSWORD_POLICY_HINT}
            </span>
          </label>

          {activeError ? <p className="text-sm text-red-700">{activeError}</p> : null}

          <SubmitButton label="Create account" />
        </form>
      )}

      <button
        type="button"
        className="mt-5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        onClick={() => setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'))}
      >
        {mode === 'signIn' ? 'Create an account' : 'Existing User'}
      </button>
    </div>
  );
}
