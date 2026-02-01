// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex items-center gap-3 rounded-full border border-divider/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary/70" />
        <span>Loading…</span>
      </div>
    </div>
  );
}
