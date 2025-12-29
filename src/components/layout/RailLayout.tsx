// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAME, storageKey } from '@/src/config/app';
import { MenuIcon } from '@/src/components/workspace/HeroIcons';

const COLLAPSE_KEY = storageKey('rail-collapsed');

export type RailLayoutContext = {
  railCollapsed: boolean;
  toggleRail: () => void;
};

export function RailLayout({
  renderRail,
  renderMain,
  outerClassName = 'min-h-screen bg-[rgba(238,243,255,0.4)]',
  asideClassName = 'relative z-40 flex min-h-screen flex-col border-r border-divider/80 bg-[rgba(238,243,255,0.85)] px-3 py-6 backdrop-blur',
  mainClassName = 'flex min-h-screen min-w-0 flex-col overflow-hidden'
}: {
  renderRail: (ctx: RailLayoutContext) => React.ReactNode;
  renderMain: (ctx: RailLayoutContext) => React.ReactNode;
  outerClassName?: string;
  asideClassName?: string;
  mainClassName?: string;
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'b') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      event.preventDefault();
      toggleRail();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const pathname = usePathname();
  const ctx: RailLayoutContext = { railCollapsed, toggleRail };

  return (
    <div className={`grid ${outerClassName}`} style={{ gridTemplateColumns: railCollapsed ? '54px minmax(0, 1fr)' : '270px minmax(0, 1fr)' }}>
      <aside className={asideClassName}>
        <div className="flex h-10 shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleRail}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 shadow-sm hover:bg-primary/10"
            aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <MenuIcon className="h-4 w-4" />
          </button>
          {!railCollapsed ? (
            <Link
              href="/"
              className={`focus-ring inline-flex h-8 flex-1 items-center justify-center rounded-full border border-divider/70 bg-white px-4 text-xs font-semibold tracking-wide text-primary shadow-sm no-underline ${
                pathname === '/' ? 'pointer-events-none' : 'hover:bg-primary/10'
              }`}
              aria-label="Back to home"
              aria-current={pathname === '/' ? 'page' : undefined}
              tabIndex={pathname === '/' ? -1 : 0}
            >
              <span>{APP_NAME}</span>
            </Link>
          ) : null}
        </div>

        {renderRail(ctx)}
      </aside>

      <section className={mainClassName}>{renderMain(ctx)}</section>
    </div>
  );
}
