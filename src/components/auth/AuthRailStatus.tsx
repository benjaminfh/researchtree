'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { UserIcon } from '@/src/components/workspace/HeroIcons';

interface AuthRailStatusProps {
  railCollapsed: boolean;
  onRequestExpandRail?: () => void;
}

export function AuthRailStatus({ railCollapsed, onRequestExpandRail }: AuthRailStatusProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'authed' | 'unauth'>('loading');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (cancelled) return;
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          setEmail(null);
          setAuthState('unauth');
          return;
        }
        const body = (await res.json()) as { user?: { email?: string | null } | null };
        setEmail(body.user?.email ?? null);
        setAuthState('authed');
      } catch {
        if (cancelled) return;
        setEmail(null);
        setAuthState('unauth');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (authState === 'unauth') return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
        className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
        aria-label={isOpen ? 'Hide account details' : 'Show account details'}
        aria-expanded={isOpen}
      >
        <UserIcon className="h-5 w-5" />
      </button>

      {isOpen ? (
        <div
          className="absolute left-full top-1/2 z-50 ml-3 w-[280px] -translate-y-1/2 rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs text-slate-700 shadow-lg backdrop-blur"
          role="dialog"
          aria-label="Account details"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Signed in as</div>
              <div className="mt-1 truncate font-semibold text-slate-900">
                {authState === 'loading' ? 'Loading…' : (email ?? 'Unknown')}
              </div>
            </div>
            <form action="/auth/signout" method="post" className="shrink-0">
              <button
                type="submit"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Profile
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
