// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { requireUser } from '@/src/server/auth';
import { ProfilePageClient } from '@/src/components/profile/ProfilePageClient';
import { RailShell } from '@/src/components/layout/RailShell';

export const runtime = 'nodejs';

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <RailShell>
      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl space-y-6">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
            <p className="text-sm text-muted">Manage your tokens and account settings.</p>
          </header>
          <ProfilePageClient email={user.email ?? null} />
        </div>
      </main>
    </RailShell>
  );
}
