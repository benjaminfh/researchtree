// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import React, { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { LLMProvider } from '@/src/shared/llmProvider';
import { useCommandEnterSubmit } from '@/src/hooks/useCommandEnterSubmit';

interface ProviderOption {
  id: LLMProvider;
  label: string;
}

interface CreateProjectFormProps {
  providerOptions: ProviderOption[];
  defaultProvider: LLMProvider;
}

export function CreateProjectForm({ providerOptions, defaultProvider }: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<LLMProvider>(defaultProvider);
  const [isSubmitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const handleCommandEnter = useCommandEnterSubmit();

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
        body: JSON.stringify({ name, description, provider })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to create project.');
      }

      const created = (await response.json().catch(() => null)) as { id?: string } | null;
      const projectId = created?.id;
      if (!projectId) {
        throw new Error('Project created but response was missing an id.');
      }
      router.push(`/projects/${projectId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onKeyDown={handleCommandEnter}
      onSubmit={handleSubmit}
      className="card-surface flex flex-col gap-4 p-6"
      data-testid="create-project-form"
    >
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
          data-testid="create-project-name"
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
          data-testid="create-project-description"
        />
      </label>

      <div className="inline-flex items-center gap-2 rounded-full border border-divider/80 bg-white px-3 py-2 text-xs shadow-sm">
        <span className="font-semibold text-slate-700">Provider</span>
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as LLMProvider)}
          className="rounded-lg border border-divider/60 bg-white px-2 py-1 text-xs text-slate-800 focus:ring-2 focus:ring-primary/30 focus:outline-none disabled:opacity-60"
          disabled={isSubmitting || providerOptions.length === 0}
          data-testid="create-project-provider"
        >
          {providerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex w-fit items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        data-testid="create-project-submit"
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
            <span>Creating…</span>
          </span>
        ) : (
          'Create Workspace'
        )}
      </button>
    </form>
  );
}
