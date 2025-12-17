'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function CreateProjectForm() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to create project.');
      }

      setName('');
      setDescription('');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card-surface flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">Create Workspace</p>
          <p className="text-sm text-muted">Spin up a new branchable workspace.</p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
          Workspace
        </span>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-800">Workspace Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Deep Research Session"
          className="rounded-lg border border-divider/80 px-3 py-2 text-base shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
          disabled={isSubmitting}
          required
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-800">Description (optional)</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short summary for future you"
          rows={3}
          className="rounded-lg border border-divider/80 px-3 py-2 text-base shadow-sm focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
          disabled={isSubmitting}
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-fit items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? 'Creating…' : 'Create Workspace'}
      </button>
    </form>
  );
}
