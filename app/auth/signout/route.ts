// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { createSupabaseServerActionClient } from '@/src/server/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerActionClient();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/login', url.origin), { status: 303 });
}
