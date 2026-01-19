// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getStoreConfig } from './src/server/storeConfig';

// Fail fast if the deployment hasn't selected a provenance store.
getStoreConfig();

function parseEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isPreviewDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (!vercelEnv) return false;
  return vercelEnv === 'preview' || vercelEnv === 'development';
}

function isMaintenanceModeEnabled(): boolean {
  return parseEnvFlag(process.env.RT_MAINTENANCE_MODE ?? process.env.MAINTENANCE_MODE);
}

function getAdminUserIds(): Set<string> {
  const raw = process.env.RT_ADMIN_USER_IDS ?? '';
  const ids = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return new Set(ids);
}

function stripTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

function isDesktopRuntime(): boolean {
  if (process.env.RT_DESKTOP !== '1') return false;
  const origin = process.env.RT_APP_ORIGIN ?? '';
  return origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:');
}

function hasAnySupabaseEnv(): boolean {
  if (isDesktopRuntime()) {
    return false;
  }
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function isExplicitLocalMode(): boolean {
  return (process.env.RT_PG_ADAPTER ?? '').toLowerCase() === 'local' && (process.env.RT_STORE ?? '').toLowerCase() === 'pg';
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

function buildMaintenanceResponse(request: NextRequest): NextResponse {
  const retryAfter = '600';
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.json(
      {
        error: 'maintenance',
        message: 'Service temporarily unavailable. Please try again soon.'
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': retryAfter
        }
      }
    );
  }

  const appName = (process.env.NEXT_PUBLIC_APP_NAME ?? 'threds').trim() || 'threds';
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Maintenance</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", serif;
        background:
          radial-gradient(1100px 700px at 10% -10%, rgba(34, 197, 94, 0.15), transparent),
          radial-gradient(900px 600px at 100% 0%, rgba(14, 165, 233, 0.2), transparent),
          #f8fafc;
        color: #0f172a;
      }
      .wrap {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 20px;
      }
      .card {
        width: min(560px, 100%);
        background: #ffffff;
        border-radius: 18px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
        padding: 32px 34px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #ecfdf3;
        color: #166534;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 600;
      }
      h1 {
        margin: 18px 0 10px;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0 0 14px;
        color: #475569;
        font-size: 16px;
        line-height: 1.6;
      }
      .muted {
        font-size: 14px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card" role="status" aria-live="polite">
        <span class="badge">Maintenance</span>
        <h1>We are tuning things up</h1>
        <p>${appName} is temporarily offline while we roll out updates. Your work is safe and will be right here when we are back.</p>
        <p class="muted">Thanks for your patience. Please check back soon.</p>
      </section>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': retryAfter
    }
  });
}

function withSupabaseCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export async function middleware(request: NextRequest) {
  const maintenanceEnabled = isMaintenanceModeEnabled();
  const adminUserIds = maintenanceEnabled ? getAdminUserIds() : new Set<string>();
  const shouldBypassAuth = isPreviewDeployment();

  const pathname = request.nextUrl.pathname;
  if (maintenanceEnabled && adminUserIds.size === 0) {
    return buildMaintenanceResponse(request);
  }

  if (!maintenanceEnabled && pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const anySupabaseEnv = hasAnySupabaseEnv();
  if (isExplicitLocalMode() && !anySupabaseEnv) {
    if (maintenanceEnabled) {
      return buildMaintenanceResponse(request);
    }
    return NextResponse.next();
  }

  const supabaseEnv = getSupabaseEnv();
  if (!supabaseEnv) {
    if (maintenanceEnabled) {
      return buildMaintenanceResponse(request);
    }
    if (anySupabaseEnv) {
      return new NextResponse('Supabase env is incomplete', { status: 500 });
    }
    return NextResponse.next();
  }

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

  if (maintenanceEnabled) {
    const userId = user?.id ?? null;
    if (!userId || !adminUserIds.has(userId)) {
      return buildMaintenanceResponse(request);
    }
  }

  if (pathname.startsWith('/api')) {
    return response;
  }

  if (user && pathname === '/login') {
    const redirectTo = sanitizeRedirectTo(request.nextUrl.searchParams.get('redirectTo')) ?? '/';
    const redirectUrl = new URL(redirectTo, request.url);
    response = withSupabaseCookies(response, NextResponse.redirect(redirectUrl));
    return response;
  }

  if (isPublicPath(pathname)) {
    return response;
  }

  if (shouldBypassAuth) {
    return response;
  }

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectTo', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    redirectUrl.searchParams.set('mode', 'signin');
    redirectUrl.hash = 'existing-user';
    response = withSupabaseCookies(response, NextResponse.redirect(redirectUrl));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
