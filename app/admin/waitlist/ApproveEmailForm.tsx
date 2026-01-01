// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { approveEmailWithFeedbackAction } from './actions';
import { useCommandEnterSubmit } from '@/src/hooks/useCommandEnterSubmit';

type ApproveState = Awaited<ReturnType<typeof approveEmailWithFeedbackAction>>;

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
          <span>Approving…</span>
        </>
      ) : (
        'Approve'
      )}
    </button>
  );
}

export function ApproveEmailForm({ action }: { action: typeof approveEmailWithFeedbackAction }) {
  const [state, formAction] = useFormState<ApproveState, FormData>(action, { ok: false, error: null, email: null });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleCommandEnter = useCommandEnterSubmit();

  useEffect(() => {
    if (!state.ok) return;
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [state.ok]);

  return (
    <form onKeyDown={handleCommandEnter} action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="block flex-1">
        <span className="text-sm font-medium text-slate-800">Email</span>
        <input
          ref={inputRef}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900/20 focus:ring-2"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <SubmitButton />
      <div className="min-h-[1.25rem] sm:ml-3 sm:self-center" aria-live="polite">
        {state.error ? <span className="text-sm font-medium text-red-700">{state.error}</span> : null}
        {!state.error && state.ok ? (
          <span className="text-sm font-medium text-emerald-700">
            Approved{state.email ? `: ${state.email}` : ''}.
          </span>
        ) : null}
      </div>
    </form>
  );
}
