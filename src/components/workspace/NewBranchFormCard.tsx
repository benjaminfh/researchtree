import React, { type FormEvent } from 'react';

export function NewBranchFormCard({
  fromLabel,
  value,
  onValueChange,
  onSubmit,
  disabled = false,
  submitting = false,
  error,
  autoFocus = false,
  variant = 'card',
  containerClassName,
}: {
  fromLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitting?: boolean;
  error?: string | null;
  autoFocus?: boolean;
  variant?: 'card' | 'plain';
  containerClassName?: string;
}) {
  const isDisabled = disabled || submitting;

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit();
      }}
      className={[
        'space-y-3',
        variant === 'card' ? 'rounded-2xl border border-divider/80 bg-white/80 p-4 shadow-sm' : '',
        containerClassName ?? '',
      ].join(' ')}
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
        />
        <button
          type="submit"
          disabled={isDisabled || !value.trim()}
          className="inline-flex items-center justify-center rounded-full bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
