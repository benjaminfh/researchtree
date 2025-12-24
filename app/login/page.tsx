import { LoginForm } from './LoginForm';
import { APP_NAME } from '@/src/config/app';

function sanitizeRedirectTo(input: string | null): string {
  if (!input) return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//')) return '/';
  return input;
}

function sanitizePrefillEmail(input: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 320) return null;
  if (/\s/.test(trimmed)) return null;
  if (!trimmed.includes('@')) return null;
  return trimmed;
}

export default function LoginPage({ searchParams }: { searchParams?: { redirectTo?: string; email?: string } }) {
  const redirectTo = sanitizeRedirectTo(searchParams?.redirectTo ?? null);
  const prefillEmail = sanitizePrefillEmail(searchParams?.email ?? null);
  return (
    <main className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-sm">
        <div className="mb-8">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{APP_NAME}</p>
          <h1 className="mt-2 text-lg font-medium text-slate-600">Welcome Back</h1>
        </div>
        <LoginForm redirectTo={redirectTo} initialEmail={prefillEmail} />
      </div>
    </main>
  );
}
