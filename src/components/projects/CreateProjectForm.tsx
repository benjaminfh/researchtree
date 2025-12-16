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
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px solid #e1e7ef',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        marginBottom: '2rem'
      }}
    >
      <h2 style={{ margin: 0 }}>Create Project</h2>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <span>Project Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Deep Research Session"
          style={{ borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.6rem' }}
          disabled={isSubmitting}
          required
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <span>Description (optional)</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short summary for future you"
          rows={3}
          style={{ borderRadius: '0.5rem', border: '1px solid #d5dce8', padding: '0.6rem' }}
          disabled={isSubmitting}
        />
      </label>
      {error ? <p style={{ color: '#bd2d2d', margin: 0 }}>{error}</p> : null}
      <button type="submit" disabled={isSubmitting} style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>
        {isSubmitting ? 'Creating…' : 'Create Project'}
      </button>
    </form>
  );
}
