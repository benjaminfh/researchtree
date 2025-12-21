import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getStoreConfig } from './src/server/storeConfig';

// Fail fast if the deployment hasn't selected a provenance store.
getStoreConfig();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isWaitlistEnforced(): boolean {
  const raw = process.env.RT_WAITLIST_ENFORCE?.trim().toLowerCase();
  if (!raw) return false;
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function getAdminEmails(): Set<string> {
  const raw = process.env.RT_ADMIN_EMAILS ?? '';
  const emails = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeEmail);
  return new Set(emails);
}

function stripTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

async function isEmailAllowlisted(url: string, serviceRoleKey: string, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const endpoint = `${stripTrailingSlashes(url)}/rest/v1/email_allowlist?select=email&email=eq.${encodeURIComponent(
    normalized
  )}&limit=1`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: 'application/json'
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    return true; // fail open
  }

  const data = (await res.json()) as Array<{ email: string }>;
  return data.length > 0;
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname === '/check-email') return true;
  if (pathname === '/forgot-password') return true;
  if (pathname === '/reset-password') return true;
  if (pathname === '/waitlist') return true;
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

function sanitizeRedirectTo(input: string | null): string | null {
  if (!input) return null;
  if (!input.startsWith('/')) return null;
  if (input.startsWith('//')) return null;
  return input;
}

export async function middleware(request: NextRequest) {
  const supabaseEnv = getSupabaseEnv();
  if (!supabaseEnv) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      }
    }
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user && isWaitlistEnforced()) {
    const email = user.email ? normalizeEmail(user.email) : null;
    const adminEmails = getAdminEmails();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? null;

    const allowed =
      !email || adminEmails.has(email) || !serviceRoleKey || !url ? true : await isEmailAllowlisted(url, serviceRoleKey, email);

    if (!allowed && !isPublicPath(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/waitlist';
      redirectUrl.searchParams.set('blocked', '1');
      if (email) redirectUrl.searchParams.set('email', email);
      response = NextResponse.redirect(redirectUrl);
      return response;
    }
  }

  if (user && pathname === '/login') {
    if (isWaitlistEnforced()) {
      const email = user.email ? normalizeEmail(user.email) : null;
      const adminEmails = getAdminEmails();
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? null;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? null;
      const allowed =
        !email || adminEmails.has(email) || !serviceRoleKey || !url ? true : await isEmailAllowlisted(url, serviceRoleKey, email);

      if (!allowed) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/waitlist';
        redirectUrl.searchParams.set('blocked', '1');
        if (email) redirectUrl.searchParams.set('email', email);
        response = NextResponse.redirect(redirectUrl);
        return response;
      }
    }

    const redirectTo = sanitizeRedirectTo(request.nextUrl.searchParams.get('redirectTo')) ?? '/';
    const redirectUrl = new URL(redirectTo, request.url);
    response = NextResponse.redirect(redirectUrl);
    return response;
  }

  if (isPublicPath(pathname)) {
    return response;
  }

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    response = NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};
