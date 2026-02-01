// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import { useFormStatus } from 'react-dom';

export function AdminSubmitButton({ label, pendingLabel, variant = 'primary' }: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  const base =
    variant === 'primary'
      ? 'bg-slate-900 text-white hover:bg-slate-800'
      : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50';
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${base} disabled:cursor-not-allowed disabled:opacity-60`}
      type="submit"
      disabled={pending}
    >
      {pending ? (
        <>
          <span
            className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${
              variant === 'primary' ? 'border-white/60 border-t-white' : 'border-slate-300 border-t-slate-700'
            }`}
          />
          <span>{pendingLabel}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
