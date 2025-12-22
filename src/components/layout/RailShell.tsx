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
      renderRail={({ railCollapsed, toggleRail }) => (
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
      )}
      renderMain={() => children}
    />
  );
}
