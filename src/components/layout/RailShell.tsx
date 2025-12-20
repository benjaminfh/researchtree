'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AuthRailStatus } from '@/src/components/auth/AuthRailStatus';
import { APP_NAME, storageKey } from '@/src/config/app';
import { ChevronLeftIcon, ChevronRightIcon, HomeIcon } from '@/src/components/workspace/HeroIcons';

const COLLAPSE_KEY = storageKey('rail-collapsed');

export function RailShell({
  children
}: {
  children: React.ReactNode;
}) {
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedCollapse = window.localStorage.getItem(COLLAPSE_KEY);
    if (storedCollapse) {
      setRailCollapsed(storedCollapse === 'true');
    }
  }, []);

  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      }
      return next;
    });
  };

  return (
    <div
      className="grid min-h-screen bg-[rgba(238,243,255,0.4)]"
      style={{ gridTemplateColumns: railCollapsed ? '72px minmax(0, 1fr)' : '270px minmax(0, 1fr)' }}
    >
      <aside className="relative z-40 flex min-h-screen flex-col border-r border-divider/80 bg-[rgba(238,243,255,0.85)] px-3 py-6 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleRail}
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 shadow-sm hover:bg-primary/10"
            aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {railCollapsed ? <ChevronRightIcon className="h-5 w-5" /> : <ChevronLeftIcon className="h-5 w-5" />}
          </button>
          {!railCollapsed ? (
            <div className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-divider/70 bg-white px-4 text-xs font-semibold tracking-wide text-primary shadow-sm">
              <span>{APP_NAME}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex h-full flex-col gap-6">
          {railCollapsed ? (
            <div className="mt-auto flex flex-col items-start gap-3 pb-2">
              <AuthRailStatus railCollapsed={railCollapsed} onRequestExpandRail={toggleRail} />
              <Link
                href="/"
                className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                aria-label="Back to home"
              >
                <HomeIcon className="h-5 w-5" />
              </Link>
            </div>
          ) : (
            <div className="mt-auto space-y-3 pb-2">
              <div className="flex flex-col items-start gap-3">
                <AuthRailStatus railCollapsed={railCollapsed} onRequestExpandRail={toggleRail} />
                <Link
                  href="/"
                  className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                  aria-label="Back to home"
                >
                  <HomeIcon className="h-5 w-5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-h-screen min-w-0 flex-col overflow-hidden">{children}</section>
    </div>
  );
}
