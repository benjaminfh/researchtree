import { NextResponse } from 'next/server';
import { createSupabaseServerActionClient } from '@/src/server/supabase/server';

function sanitizeRedirectTo(input: string | null): string | null {
  if (!input) return null;
  if (!input.startsWith('/')) return null;
  if (input.startsWith('//')) return null;
  return input;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const redirectTo = sanitizeRedirectTo(url.searchParams.get('redirectTo')) ?? '/';

  if (code) {
    try {
      const supabase = createSupabaseServerActionClient();
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      // ignore and fall through
    }
  }

  return NextResponse.redirect(new URL(redirectTo, url.origin), { status: 303 });
}

