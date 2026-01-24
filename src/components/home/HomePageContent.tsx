// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CreateProjectForm } from '@/src/components/projects/CreateProjectForm';
import {
  ArchiveBoxArrowDownIcon,
  CheckIcon,
  ChevronRightIcon,
  SharedWorkspaceIcon
} from '@/src/components/workspace/HeroIcons';
import { BlueprintIcon } from '@/src/components/ui/BlueprintIcon';
import { AuthRailStatus } from '@/src/components/auth/AuthRailStatus';
import { APP_NAME, storageKey } from '@/src/config/app';
import type { ProjectMetadata } from '@git/types';
import type { LLMProvider } from '@/src/shared/llmProvider';
import { RailPageLayout } from '@/src/components/layout/RailPageLayout';

interface HomePageContentProps {
  projects: Array<ProjectMetadata & { nodeCount: number; lastModified: number }>;
  providerOptions: Array<{ id: LLMProvider; label: string }>;
  defaultProvider: LLMProvider;
}

const ARCHIVE_KEY = storageKey('archived-projects');
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC'
});

export function HomePageContent({ projects, providerOptions, defaultProvider }: HomePageContentProps) {
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<Set<string>>(new Set());
  const [showTokenPrompt, setShowTokenPrompt] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) return;
        const body = (await res.json()) as {
          llmTokens?: {
            openai?: { configured?: boolean };
            gemini?: { configured?: boolean };
            anthropic?: { configured?: boolean };
          };
        };
        if (cancelled) return;
        const configured =
          body?.llmTokens?.openai?.configured ||
          body?.llmTokens?.gemini?.configured ||
          body?.llmTokens?.anthropic?.configured;
        if (!configured) {
          setShowTokenPrompt(true);
        }
      } catch {
        // Ignore profile fetch errors; we only prompt when the status is known.
      }
    }
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (confirming.size === 0) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-confirm-action="true"]')) return;
      setConfirming(new Set());
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [confirming]);

  const persistArchive = (next: Set<string>) => {
    setArchived(new Set(next));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...next]));
    }
  };

  const recentProjects = useMemo(() => projects.filter((p) => !archived.has(p.id)).slice(0, 12), [projects, archived]);
  const archivedProjects = useMemo(() => projects.filter((p) => archived.has(p.id)), [projects, archived]);
  const isSharedWorkspace = (project: ProjectMetadata) => project.isOwner === false;

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
    <>
      <RailPageLayout
        renderRail={({ railCollapsed, toggleRail }) => (
          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {!railCollapsed ? (
              <>
                <div className="rounded-full bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary shadow-sm">
                  Workspaces
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                    <div className={`flex min-h-0 flex-1 flex-col gap-2 ${archivedProjects.length > 0 ? 'border-b border-divider/60 pb-3' : ''}`}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">Recent</div>
                      {recentProjects.length === 0 ? (
                        <p className="rounded-xl border border-divider/60 bg-white/80 px-3 py-2 text-xs text-muted shadow-sm">
                          No workspaces yet. Create one to get started.
                        </p>
                      ) : (
                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                          <ul className="grid min-w-0 grid-cols-1 gap-2">
                            {recentProjects.map((project) => {
                              const isConfirming = confirming.has(project.id);
                              return (
                                <li
                                  key={project.id}
                                  className="group w-full min-w-0 rounded-xl border border-divider/60 bg-white/90 px-3 py-2 shadow-sm transition hover:border-primary/50"
                                  title={project.name}
                                  data-project-id={project.id}
                                >
                                  <div className="flex min-w-0 items-center justify-between gap-3">
                                    <Link href={`/projects/${project.id}`} className="min-w-0 flex-1" title={project.name}>
                                      <div className="truncate text-sm font-semibold text-slate-900" title={project.name}>
                                        {project.name}
                                      </div>
                                      <div className="text-xs text-muted">
                                        {dateFormatter.format(new Date(project.lastModified))}
                                      </div>
                                    </Link>
                                    <div className="flex items-center gap-2">
                                      {isSharedWorkspace(project) ? (
                                        <span
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider bg-white text-slate-700"
                                          title="Shared with you"
                                          role="img"
                                          aria-label="Shared with you"
                                        >
                                          <SharedWorkspaceIcon className="h-4 w-4" />
                                        </span>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isConfirming) {
                                            handleArchive(project.id);
                                          } else {
                                            setConfirming((prev) => new Set(prev).add(project.id));
                                          }
                                        }}
                                        data-confirm-action="true"
                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition ${
                                          isConfirming
                                            ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                            : 'border border-divider bg-white text-slate-700 hover:bg-primary/10'
                                        }`}
                                        aria-label={isConfirming ? 'Confirm archive' : 'Archive workspace'}
                                        data-testid="archive-workspace"
                                        data-project-id={project.id}
                                      >
                                        {isConfirming ? (
                                          <CheckIcon className="h-4 w-4" />
                                        ) : (
                                          <ArchiveBoxArrowDownIcon className="h-4 w-4" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                    {archivedProjects.length > 0 ? (
                      <div
                        className={`flex min-h-0 flex-col gap-2 pt-2 ${
                          showArchived ? 'h-[66%]' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setShowArchived((prev) => !prev)}
                          className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:bg-primary/10 hover:text-slate-700"
                          aria-expanded={showArchived}
                        >
                          <span>Archived</span>
                          <span
                            className={`text-muted transition-transform ${
                              showArchived ? 'rotate-90' : ''
                            }`}
                          >
                            <ChevronRightIcon className="h-3 w-3" />
                          </span>
                        </button>
                        {showArchived ? (
                          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                            <ul className="grid min-w-0 grid-cols-1 gap-2">
                              {archivedProjects.map((project) => {
                                const isConfirming = confirming.has(project.id);
                                return (
                                  <li
                                    key={project.id}
                                    className="w-full min-w-0 rounded-xl border border-divider/60 bg-white/80 px-3 py-2 shadow-sm"
                                    title={project.name}
                                    data-project-id={project.id}
                                  >
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                      <span
                                        className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900"
                                        title={project.name}
                                      >
                                        {project.name}
                                      </span>
                                      <div className="ml-auto inline-flex items-center gap-2">
                                        {isSharedWorkspace(project) ? (
                                          <span
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider bg-white text-slate-700"
                                            title="Shared with you"
                                            role="img"
                                            aria-label="Shared with you"
                                          >
                                            <SharedWorkspaceIcon className="h-4 w-4" />
                                          </span>
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (isConfirming) {
                                              handleUnarchive(project.id);
                                            } else {
                                              setConfirming((prev) => new Set(prev).add(project.id));
                                            }
                                          }}
                                          data-confirm-action="true"
                                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm transition ${
                                            isConfirming
                                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                              : 'border border-divider bg-white text-slate-700 hover:bg-primary/10'
                                          }`}
                                          aria-label={isConfirming ? 'Confirm unarchive' : 'Unarchive workspace'}
                                          data-testid="unarchive-workspace"
                                          data-project-id={project.id}
                                        >
                                          {isConfirming ? (
                                            <CheckIcon className="h-4 w-4" />
                                          ) : (
                                            <BlueprintIcon icon="unarchive" className="h-4 w-4" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                </div>
              </>
            ) : null}

            <div className="mt-auto flex items-start pb-2">
              <AuthRailStatus railCollapsed={railCollapsed} onRequestExpandRail={toggleRail} />
            </div>
          </div>
        )}
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

              <CreateProjectForm providerOptions={providerOptions} defaultProvider={defaultProvider} />
            </div>
          </div>
        )}
      />

      {showTokenPrompt ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Add your first API token</h2>
            <p className="mt-2 text-sm text-muted">
              You have not saved any provider tokens yet. Add one in Profile to start chatting.
            </p>
            <div className="mt-4 flex justify-end">
              <Link
                href="/profile"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                onClick={() => setShowTokenPrompt(false)}
              >
                Go to Profile
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
