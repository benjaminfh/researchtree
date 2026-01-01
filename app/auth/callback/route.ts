// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { NextResponse } from 'next/server';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';

function sanitizeRedirectTo(input: string | null, requestOrigin: string): string | null {
  if (!input) return null;
  if (input.startsWith('/')) {
    if (input.startsWith('//')) return null;
    return input;
  }

  try {
    const candidate = new URL(input, requestOrigin);
    if (candidate.origin !== requestOrigin) return null;
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const flow = url.searchParams.get('flow');
  const redirectTo =
    sanitizeRedirectTo(url.searchParams.get('redirectTo'), url.origin) ??
    sanitizeRedirectTo(url.searchParams.get('redirect_to'), url.origin) ??
    '/';

  if (code) {
    try {
      const supabase = createSupabaseServerActionClient();
      await supabase.auth.exchangeCodeForSession(code);

      if (flow === 'signup-confirm') {
        await supabase.auth.signOut();
      }
    } catch {
      // ignore and fall through
    }
  }

  return NextResponse.redirect(new URL(redirectTo, url.origin), { status: 303 });
}
