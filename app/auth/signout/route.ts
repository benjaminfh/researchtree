import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
  const url = new URL(request.url);
  return NextResponse.redirect(new URL('/login', url.origin), { status: 303 });
}
