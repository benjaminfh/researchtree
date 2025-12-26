'use client';

import React from 'react';
import Link from 'next/link';
import { AuthRailStatus } from '@/src/components/auth/AuthRailStatus';
import { HomeIcon } from '@/src/components/workspace/HeroIcons';
import { RailLayout } from '@/src/components/layout/RailLayout';

export function RailShell({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <RailLayout
      outerClassName="h-screen bg-[rgba(238,243,255,0.4)]"
      asideClassName="relative z-40 flex h-screen flex-col border-r border-divider/80 bg-[rgba(238,243,255,0.85)] px-3 py-6 backdrop-blur"
      mainClassName="h-screen min-w-0 overflow-y-auto"
      renderRail={({ railCollapsed, toggleRail }) => (
        <div className="mt-6 flex flex-1 flex-col gap-6">
          {railCollapsed ? (
            <div className="mt-auto flex flex-col items-start gap-3 pb-2">
              <AuthRailStatus railCollapsed={railCollapsed} onRequestExpandRail={toggleRail} />
              <Link
                href="/"
                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                aria-label="Back to home"
              >
                <HomeIcon className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="mt-auto space-y-3 pb-2">
              <div className="flex flex-col items-start gap-3">
                <AuthRailStatus railCollapsed={railCollapsed} onRequestExpandRail={toggleRail} />
                <Link
                  href="/"
                  className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
                  aria-label="Back to home"
                >
                  <HomeIcon className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
      renderMain={() => children}
    />
  );
}
