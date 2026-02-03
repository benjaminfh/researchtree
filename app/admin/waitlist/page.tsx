// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { requireAdminUser } from '@/src/server/admin';
import { listAllowlistedEmails, listWaitlistRequests } from '@/src/server/waitlist';
import { approveEmailAction, approveEmailWithFeedbackAction, removeAllowlistEmailAction } from './actions';
import { ApproveEmailForm } from './ApproveEmailForm';
import { AdminSubmitButton } from './AdminSubmitButton';
import { CommandEnterForm } from '@/src/components/forms/CommandEnterForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminWaitlistPage() {
  await requireAdminUser();

  const [pendingRequests, allowlist] = await Promise.all([listWaitlistRequests('pending'), listAllowlistedEmails()]);

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Waitlist Admin</h1>
          <p className="mt-2 text-sm text-slate-600">Approve emails to allow sign up and sign in.</p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Approve by email</h2>
          <ApproveEmailForm action={approveEmailWithFeedbackAction} />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Pending requests</h2>
          {pendingRequests.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No pending requests.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {pendingRequests.map((req) => (
                <li key={req.email} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{req.email}</p>
                    <p className="text-xs text-slate-500">
                      Requests: {req.request_count ?? 1}
                      {req.last_requested_at ? ` • Last: ${new Date(req.last_requested_at).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <CommandEnterForm action={approveEmailAction}>
                    <input type="hidden" name="email" value={req.email} />
                    <AdminSubmitButton label="Approve" pendingLabel="Approving…" />
                  </CommandEnterForm>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Allowlist</h2>
          {allowlist.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No allowlisted emails yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {allowlist.map((item) => (
                <li key={item.email} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.email}</p>
                    <p className="text-xs text-slate-500">
                      {item.created_by ? `Approved by ${item.created_by}` : 'Approved'}
                    </p>
                  </div>
                  <CommandEnterForm action={removeAllowlistEmailAction}>
                    <input type="hidden" name="email" value={item.email} />
                    <AdminSubmitButton label="Remove" pendingLabel="Removing…" variant="secondary" />
                  </CommandEnterForm>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
