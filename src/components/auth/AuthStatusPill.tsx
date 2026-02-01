// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function AuthStatusPill() {
  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) return null;

    return (
      <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs text-slate-700 shadow-sm backdrop-blur">
        <span className="max-w-[220px] truncate">
          Signed in as <span className="font-semibold text-slate-900">{email}</span>
        </span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  } catch {
    return null;
  }
}

