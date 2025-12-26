'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAME, storageKey } from '@/src/config/app';
import { MenuClosedIcon, MenuIcon } from '@/src/components/workspace/HeroIcons';

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

  const pathname = usePathname();
  const ctx: RailLayoutContext = { railCollapsed, toggleRail };

  return (
    <div className={`grid ${outerClassName}`} style={{ gridTemplateColumns: railCollapsed ? '54px minmax(0, 1fr)' : '270px minmax(0, 1fr)' }}>
      <aside className={asideClassName}>
        <div className="flex h-10 items-center gap-2">
          <button
            type="button"
            onClick={toggleRail}
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border border-divider/70 bg-white text-slate-700 shadow-sm hover:bg-primary/10"
            aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {railCollapsed ? <MenuIcon className="h-4 w-4" /> : <MenuClosedIcon className="h-4 w-4" />}
          </button>
          {!railCollapsed ? (
            pathname === '/' ? (
              <div className="inline-flex h-8 flex-1 items-center justify-center rounded-full border border-divider/70 bg-white px-4 text-xs font-semibold tracking-wide text-primary shadow-sm">
                <span>{APP_NAME}</span>
              </div>
            ) : (
              <Link
                href="/"
                className="focus-ring inline-flex h-8 flex-1 items-center justify-center rounded-full border border-divider/70 bg-white px-4 text-xs font-semibold tracking-wide text-primary shadow-sm hover:bg-primary/10"
                aria-label="Back to home"
              >
                <span>{APP_NAME}</span>
              </Link>
            )
          ) : null}
        </div>

        {renderRail(ctx)}
      </aside>

      <section className={mainClassName}>{renderMain(ctx)}</section>
    </div>
  );
}
