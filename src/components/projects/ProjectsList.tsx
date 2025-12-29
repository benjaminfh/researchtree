// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ProjectMetadata } from '@git/types';
import { formatDateTime } from '@/src/utils/formatDate';

interface ProjectsListProps {
  projects: Array<ProjectMetadata & { nodeCount: number }>;
  archived: Set<string>;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}

export function ProjectsList({ projects, archived, onArchive, onUnarchive }: ProjectsListProps) {
  const [showList, setShowList] = useState(false);

  const activeProjects = useMemo(() => projects.filter((p) => !archived.has(p.id)), [projects, archived]);
  const archivedProjects = useMemo(() => projects.filter((p) => archived.has(p.id)), [projects, archived]);

  const renderList = (items: typeof projects, actionLabel: string, onClick: (id: string) => void) => (
    <ul className="grid list-none gap-3 p-0">
      {items.map((project) => (
        <li key={project.id} className="card-surface p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{project.name}</h2>
                {project.branchName ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {project.branchName}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted">
                Created {formatDateTime(project.createdAt)} · Messages {project.nodeCount}
              </p>
              <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-primary hover:text-primary/80">
                Open workspace →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => onClick(project.id)}
              className="inline-flex items-center justify-center rounded-full border border-divider px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-primary/10"
            >
              {actionLabel}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => setShowList((prev) => !prev)}
        className="self-start rounded-full border border-divider bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-primary/10"
      >
        {showList ? 'Hide project list' : 'Show project list'}
      </button>

      {showList ? (
        <>
          {activeProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-divider/80 bg-white p-8 text-center text-slate-700 shadow-sm">
              <p>No visible projects. Create one or restore an archived project below.</p>
            </div>
          ) : (
            renderList(activeProjects, 'Archive', (id) => {
              onArchive(id);
            })
          )}

          {archivedProjects.length > 0 ? (
            <div className="border-t border-divider/80 pt-4">
              <p className="mb-3 text-sm font-medium text-muted">Archived projects</p>
              {renderList(archivedProjects, 'Unarchive', (id) => {
                onUnarchive(id);
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
