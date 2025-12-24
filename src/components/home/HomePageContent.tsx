'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CreateProjectForm } from '@/src/components/projects/CreateProjectForm';
import { ArchiveBoxArrowDownIcon } from '@/src/components/workspace/HeroIcons';
import { AuthRailStatus } from '@/src/components/auth/AuthRailStatus';
import { APP_NAME, storageKey } from '@/src/config/app';
import type { ProjectMetadata } from '@git/types';
import { RailLayout } from '@/src/components/layout/RailLayout';

interface HomePageContentProps {
  projects: Array<ProjectMetadata & { nodeCount: number; lastModified: number }>;
}

const ARCHIVE_KEY = storageKey('archived-projects');
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC'
});

export function HomePageContent({ projects }: HomePageContentProps) {
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedArchive = window.localStorage.getItem(ARCHIVE_KEY);
    if (storedArchive) {
      try {
        const parsed = JSON.parse(storedArchive) as string[];
        setArchived(new Set(parsed));
      } catch {
        setArchived(new Set());
      }
    }
  }, []);

  const persistArchive = (next: Set<string>) => {
    setArchived(new Set(next));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...next]));
    }
  };

  const recentProjects = useMemo(() => projects.filter((p) => !archived.has(p.id)).slice(0, 12), [projects, archived]);
  const archivedProjects = useMemo(() => projects.filter((p) => archived.has(p.id)), [projects, archived]);

  const handleArchive = (id: string) => {
    const next = new Set(archived);
    next.add(id);
    persistArchive(next);
    setConfirming((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
  };

  const handleUnarchive = (id: string) => {
    const next = new Set(archived);
    next.delete(id);
    persistArchive(next);
    setConfirming((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
  };

  return (
    <RailLayout
      asideClassName="relative z-40 flex min-h-screen flex-col border-r border-divider/70 bg-[rgba(238,243,255,0.85)] px-3 py-4"
      renderRail={({ railCollapsed, toggleRail }) =>
        !railCollapsed ? (
          <div className="mt-6 flex flex-1 flex-col gap-3">
            <div className="rounded-full bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
              Workspaces
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Recent</div>
            <div className="flex-1 overflow-hidden">
              {recentProjects.length === 0 ? (
                <p className="rounded-xl border border-divider/60 bg-white/80 px-3 py-2 text-xs text-muted shadow-sm">
                  No workspaces yet. Create one to get started.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {recentProjects.map((project) => {
                    const isConfirming = confirming.has(project.id);
                    return (
                      <li
                        key={project.id}
                        className="group rounded-xl border border-divider/60 bg-white/90 px-3 py-2 shadow-sm transition hover:border-primary/50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Link href={`/projects/${project.id}`} className="flex-1 truncate" title={project.name}>
                            <div className="truncate text-sm font-semibold text-slate-900">{project.name}</div>
                            <div className="text-xs text-muted">{dateFormatter.format(new Date(project.lastModified))}</div>
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              if (isConfirming) {
                                handleArchive(project.id);
                              } else {
                                setConfirming((prev) => new Set(prev).add(project.id));
                              }
                            }}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition ${
                              isConfirming
                                ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                : 'border border-divider bg-white text-slate-700 hover:bg-primary/10'
                            }`}
                            aria-label={isConfirming ? 'Confirm archive' : 'Archive workspace'}
                          >
                            {isConfirming ? '!' : <ArchiveBoxArrowDownIcon className="h-4 w-4" />}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {archivedProjects.length > 0 ? (
              <div className="mt-4 space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Archived</div>
                <ul className="grid gap-2">
                  {archivedProjects.map((project) => {
                    const isConfirming = confirming.has(project.id);
                    return (
                      <li key={project.id} className="rounded-xl border border-divider/60 bg-white/80 px-3 py-2 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">{project.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (isConfirming) {
                                handleUnarchive(project.id);
                              } else {
                                setConfirming((prev) => new Set(prev).add(project.id));
                              }
                            }}
                            className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                              isConfirming
                                ? 'border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                                : 'border border-divider bg-white text-slate-700 hover:bg-primary/10'
                            }`}
                          >
                            {isConfirming ? 'Confirm' : 'Unarchive'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="mt-auto flex items-start pb-2">
              <AuthRailStatus railCollapsed={railCollapsed} onRequestExpandRail={toggleRail} />
            </div>
          </div>
        ) : (
          <div className="mt-auto flex items-start pb-2">
            <AuthRailStatus railCollapsed={railCollapsed} onRequestExpandRail={toggleRail} />
          </div>
        )
      }
      renderMain={() => (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-12 space-y-8">
            <header className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-6 py-2 text-base font-semibold text-primary">
                <span>{APP_NAME}</span>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold text-slate-900">Branchable Chat for Deep Research Sessions</h1>
                <p className="text-base text-muted">
                  Spin up a workspace, branch your train of thought and context, and work on a canvas.
                </p>
              </div>
            </header>

            <CreateProjectForm />
          </div>
        </div>
      )}
    />
  );
}
