import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getStoreConfig } from './src/server/storeConfig';

// Fail fast if the deployment hasn't selected a provenance store.
getStoreConfig();

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/login') return true;
  if (pathname === '/check-email') return true;
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

  if (user && pathname === '/login') {
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
