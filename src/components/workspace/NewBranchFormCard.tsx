// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import React, { type FormEvent } from 'react';
import { useCommandEnterSubmit } from '@/src/hooks/useCommandEnterSubmit';

export function NewBranchFormCard({
  fromLabel,
  value,
  onValueChange,
  onSubmit,
  children,
  providerSelector,
  disabled = false,
  submitting = false,
  error,
  autoFocus = false,
  variant = 'card',
  containerClassName,
  testId,
  inputTestId,
  submitTestId
}: {
  fromLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  children?: React.ReactNode;
  providerSelector?: React.ReactNode;
  disabled?: boolean;
  submitting?: boolean;
  error?: string | null;
  autoFocus?: boolean;
  variant?: 'card' | 'plain';
  containerClassName?: string;
  testId?: string;
  inputTestId?: string;
  submitTestId?: string;
}) {
  const isDisabled = disabled || submitting;
  const handleCommandEnter = useCommandEnterSubmit({ enabled: !isDisabled && Boolean(value.trim()) });

  return (
    <form
      onKeyDown={handleCommandEnter}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit();
      }}
      className={[
        'space-y-3',
        variant === 'card' ? 'rounded-2xl border border-divider/80 bg-white/80 p-4 shadow-sm' : '',
        containerClassName ?? '',
      ].join(' ')}
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">New branch</span>
        <span className="text-xs text-muted">{fromLabel} →</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="feature/idea"
          className="w-full rounded-lg border border-divider/80 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
          disabled={isDisabled}
          autoFocus={autoFocus}
          required
          data-testid={inputTestId}
        />
        <button
          type="submit"
          disabled={isDisabled || !value.trim()}
          className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          data-testid={submitTestId}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/60 border-t-white" />
              <span>Creating…</span>
            </span>
          ) : (
            'Create'
          )}
        </button>
      </div>
      {providerSelector ? <div>{providerSelector}</div> : null}
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
