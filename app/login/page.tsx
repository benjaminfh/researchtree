// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { LoginForm } from './LoginForm';
import { APP_NAME } from '@/src/config/app';
import BranchingTracesBackground from '@/src/components/login/BranchingTracesBackground';

export const runtime = 'nodejs';

function sanitizeRedirectTo(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

function sanitizePrefillEmail(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 320) return null;
  if (/\s/.test(trimmed)) return null;
  if (!trimmed.includes('@')) return null;
  return trimmed;
}

function sanitizeMode(input: string | null): 'signUp' | 'signIn' {
  if (!input) return 'signUp';
  const normalized = input.trim().toLowerCase();
  if (normalized === 'signin') return 'signIn';
  return 'signUp';
}

function isWaitlistEnforced(): boolean {
  const raw = process.env.RT_WAITLIST_ENFORCE?.trim().toLowerCase();
  if (!raw) return false;
  return !['0', 'false', 'off', 'no'].includes(raw);
}

export default function LoginPage({ searchParams }: { searchParams?: { redirectTo?: string; email?: string; mode?: string } }) {
  const redirectTo = sanitizeRedirectTo(searchParams?.redirectTo ?? null);
  const prefillEmail = sanitizePrefillEmail(searchParams?.email ?? null);
  const initialMode = sanitizeMode(searchParams?.mode ?? null);
  const waitlistEnforced = isWaitlistEnforced();
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(226,232,255,0.7),_rgba(248,250,252,0.95)_48%,_rgba(255,255,255,1)_100%)] px-6 py-12">
      <BranchingTracesBackground className="absolute inset-0" />
      <div className="relative mx-auto flex w-full max-w-4xl flex-col items-start justify-center gap-10">
        <div className="max-w-md">
          <p className="text-4xl font-semibold tracking-tight text-slate-900">{APP_NAME}</p>
          <h1 className="mt-3 text-lg font-medium text-slate-600">Welcome Back</h1>
          <p className="mt-3 text-sm text-slate-500">
            Start a new branch of thought or pick up where you left off. Your workspace is waiting.
          </p>
        </div>
        <div className="w-full max-w-sm">
          <LoginForm
            redirectTo={redirectTo}
            initialEmail={prefillEmail}
            initialMode={initialMode}
            waitlistEnforced={waitlistEnforced}
          />
        </div>
      </div>
    </main>
  );
}
