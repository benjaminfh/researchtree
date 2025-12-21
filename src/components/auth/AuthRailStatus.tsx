'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { UserIcon } from '@/src/components/workspace/HeroIcons';
import { RailPopover } from '@/src/components/layout/RailPopover';

interface AuthRailStatusProps {
  railCollapsed: boolean;
  onRequestExpandRail?: () => void;
}

export function AuthRailStatus({ railCollapsed, onRequestExpandRail }: AuthRailStatusProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'authed' | 'unauth'>('loading');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

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

  useEffect(() => {
    if (!isOpen) {
      setConfirmSignOut(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!confirmSignOut) return;
    const timeout = window.setTimeout(() => setConfirmSignOut(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [confirmSignOut]);

  if (authState === 'unauth') return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
        ref={triggerRef}
        className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-divider/80 bg-white text-slate-800 shadow-sm transition hover:bg-primary/10"
        aria-label={isOpen ? 'Hide account details' : 'Show account details'}
        aria-expanded={isOpen}
      >
        <UserIcon className="h-5 w-5" />
      </button>

      <RailPopover open={isOpen} anchorRef={triggerRef} ariaLabel="Account details" className="w-[320px] p-4 text-xs text-slate-700">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0 pr-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Signed in as</div>
            <div className="mt-1 truncate font-semibold text-slate-900">
              {authState === 'loading' ? 'Loading…' : (email ?? 'Unknown')}
            </div>
          </div>

          <div className="grid grid-flow-col auto-cols-max grid-rows-2 content-start gap-2">
            <form action="/auth/signout" method="post" className="contents">
              <button
                type="submit"
                onClick={(event) => {
                  if (!confirmSignOut) {
                    event.preventDefault();
                    setConfirmSignOut(true);
                  }
                }}
                className={[
                  'rounded-full border px-3 py-1 font-semibold transition',
                  confirmSignOut
                    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {confirmSignOut ? 'Confirm' : 'Sign out'}
              </button>
            </form>
            <Link
              href="/profile"
              onClick={() => {
                setIsOpen(false);
                setConfirmSignOut(false);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Profile
            </Link>
          </div>
        </div>
      </RailPopover>
    </div>
  );
}
