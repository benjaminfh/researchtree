'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ProjectMetadata } from '@git/types';
import { formatDateTime } from '@/src/utils/formatDate';

interface ProjectsListProps {
  projects: Array<ProjectMetadata & { nodeCount: number }>;
}

const HIDDEN_KEY = 'researchtree:hidden-projects';

export function ProjectsList({ projects }: ProjectsListProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(HIDDEN_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        setHidden(new Set(parsed));
      } catch {
        setHidden(new Set());
      }
    }
  }, []);

  const persist = (next: Set<string>) => {
    setHidden(new Set(next));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    }
  };

  const activeProjects = useMemo(() => projects.filter((p) => !hidden.has(p.id)), [projects, hidden]);
  const hiddenProjects = useMemo(() => projects.filter((p) => hidden.has(p.id)), [projects, hidden]);

  const renderList = (items: typeof projects, actionLabel: string, onClick: (id: string) => void) => (
    <ul style={{ display: 'grid', gap: '1rem', listStyle: 'none', padding: 0 }}>
      {items.map((project) => (
        <li key={project.id} style={{ border: '1px solid #e1e7ef', borderRadius: '0.75rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: '0 0 0.5rem' }}>{project.name}</h2>
              <p style={{ margin: '0 0 1rem', color: '#5f6b7c' }}>
                Created {formatDateTime(project.createdAt)} · Branch {project.branchName ?? 'main'} · Nodes {project.nodeCount}
              </p>
              <Link href={`/projects/${project.id}`} style={{ fontWeight: 600 }}>
                Open workspace →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => onClick(project.id)}
              style={{ padding: '0.45rem 0.8rem', borderRadius: '0.5rem', border: '1px solid #d5dce8', background: '#fff' }}
            >
              {actionLabel}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {activeProjects.length === 0 ? (
        <div style={{ padding: '2rem', border: '1px dashed #c3cad5', borderRadius: '1rem' }}>
          <p>No visible projects. Create one or restore a hidden project below.</p>
        </div>
      ) : (
        renderList(activeProjects, 'Hide', (id) => {
          const next = new Set(hidden);
          next.add(id);
          persist(next);
        })
      )}

      {hiddenProjects.length > 0 ? (
        <div style={{ borderTop: '1px solid #e1e7ef', paddingTop: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem', color: '#5f6b7c' }}>Hidden projects</p>
          {renderList(hiddenProjects, 'Unhide', (id) => {
            const next = new Set(hidden);
            next.delete(id);
            persist(next);
          })}
        </div>
      ) : null}
    </section>
  );
}
