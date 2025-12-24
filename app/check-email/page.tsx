import Link from 'next/link';
import { APP_NAME } from '@/src/config/app';

function sanitizeRedirectTo(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export default function CheckEmailPage({
  searchParams
}: {
  searchParams?: { redirectTo?: string; email?: string; mode?: string };
}) {
  const redirectTo = sanitizeRedirectTo(searchParams?.redirectTo ?? null);
  const email = (searchParams?.email ?? '').trim();
  const mode = searchParams?.mode === 'reset' ? 'reset' : 'confirm';
  const maskedEmail = email ? maskEmail(email) : null;
  const loginParams = new URLSearchParams();
  loginParams.set('redirectTo', redirectTo);
  if (email) loginParams.set('email', email);
  const loginHref = `/login?${loginParams.toString()}#existing-user`;

  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-8">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{APP_NAME}</p>
          <h1 className="mt-2 text-lg font-medium text-slate-700">Check your email</h1>
          <p className="mt-3 text-sm text-slate-600">
            {mode === 'reset'
              ? `If an account exists${maskedEmail ? ` for ${maskedEmail}` : ''}, we sent a password reset link.`
              : `We sent you a confirmation link${maskedEmail ? ` to ${maskedEmail}` : ''}. Click it to finish creating your account.`}
          </p>
          <p className="mt-3 text-sm text-slate-600">
            {mode === 'reset'
              ? 'After clicking the link, you’ll be able to set a new password.'
              : 'After confirming, you’ll be redirected to sign in.'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">Didn’t get the email?</p>
            <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
              <li>Check spam / promotions folders.</li>
              <li>Make sure you used the right email address.</li>
              <li>Wait a minute and refresh your inbox.</li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={loginHref}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
