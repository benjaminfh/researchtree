// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

'use client';

import { useEffect, useMemo, useState } from 'react';

type ProfileResponse = {
  user: { id: string; email: string | null };
  llmTokens: {
    openai: { configured: boolean };
    gemini: { configured: boolean };
    anthropic: { configured: boolean };
  };
  updatedAt: string | null;
};

const mask = '••••••••••••••••';

export function ProfilePageClient({ email }: { email: string | null }) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isDesktopEnv, setIsDesktopEnv] = useState(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator?.userAgent ?? '';
    return ua.includes('Electron') || 'desktopApi' in window;
  });
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [clearOpenai, setClearOpenai] = useState(false);
  const [clearGemini, setClearGemini] = useState(false);
  const [clearAnthropic, setClearAnthropic] = useState(false);
  const showTokenLoading = loading && !profile;

  const placeholders = useMemo(() => {
    return {
      openai: profile?.llmTokens.openai.configured ? mask : 'Not set',
      gemini: profile?.llmTokens.gemini.configured ? mask : 'Not set',
      anthropic: profile?.llmTokens.anthropic.configured ? mask : 'Not set'
    };
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/profile');
        if (!res.ok) throw new Error('Failed to load profile');
        const body = (await res.json()) as ProfileResponse;
        if (cancelled) return;
        setProfile(body);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error)?.message ?? 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = window.navigator?.userAgent ?? '';
    setIsDesktopEnv(ua.includes('Electron') || 'desktopApi' in window);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, string | null | undefined> = {};
      if (clearOpenai) payload.openaiToken = null;
      else if (openaiKey.trim()) payload.openaiToken = openaiKey;

      if (clearGemini) payload.geminiToken = null;
      else if (geminiKey.trim()) payload.geminiToken = geminiKey;

      if (clearAnthropic) payload.anthropicToken = null;
      else if (anthropicKey.trim()) payload.anthropicToken = anthropicKey;

      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to save');
      }

      const refreshed = await fetch('/api/profile');
      if (refreshed.ok) {
        const body = (await refreshed.json()) as ProfileResponse;
        setProfile(body);
      }

      setOpenaiKey('');
      setGeminiKey('');
      setAnthropicKey('');
      setClearOpenai(false);
      setClearGemini(false);
      setClearAnthropic(false);
      setNotice('Saved.');
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setChangingPassword(true);
    setPasswordError(null);
    setPasswordNotice(null);
    try {
      if (!newPassword.trim()) {
        setPasswordError('New password is required.');
        return;
      }
      if (newPassword.length < 8) {
        setPasswordError('Password must be at least 8 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError('Passwords do not match.');
        return;
      }

      const res = await fetch('/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword, confirmPassword })
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to update password.');
      }

      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('Password updated.');
    } catch (err) {
      setPasswordError((err as Error)?.message ?? 'Failed to update password.');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <section className="rounded-2xl border border-divider/70 bg-white/90 p-6 shadow-sm">
      <div className="space-y-5">
        {!isDesktopEnv ? (
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Signed in as</div>
            <div className="truncate text-sm font-semibold text-slate-900">{email ?? 'Unknown'}</div>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">LLM Provider Tokens</div>

          {showTokenLoading ? (
            <div className="grid gap-3 animate-pulse">
              <div className="h-11 rounded-xl bg-slate-100" />
              <div className="h-11 rounded-xl bg-slate-100" />
              <div className="h-11 rounded-xl bg-slate-100" />
            </div>
          ) : (
            <div className="grid gap-3">
              <label className="grid gap-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">OpenAI token</span>
                  {profile?.llmTokens.openai.configured ? (
                    <button
                      type="button"
                      disabled={saving || loading}
                      onClick={() => {
                        setOpenaiKey('');
                        setClearOpenai(true);
                        setNotice(null);
                      }}
                      className="rounded-full border border-divider/70 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      Clear
                    </button>
                  ) : null}
                </span>
                <input
                  value={openaiKey}
                  onChange={(e) => {
                    setOpenaiKey(e.target.value);
                    setClearOpenai(false);
                  }}
                  placeholder={loading ? 'Loading…' : placeholders.openai}
                  autoComplete="off"
                  disabled={saving || loading}
                  className="focus-ring h-11 w-full rounded-xl border border-divider/70 bg-white px-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:opacity-60"
                />
                <span className="text-xs text-muted">
                  {clearOpenai
                    ? 'Will clear on save.'
                    : profile?.llmTokens.openai.configured
                      ? 'Token configured (enter a new value to replace).'
                      : 'No token set.'}
                </span>
              </label>

              <label className="grid gap-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">Gemini token</span>
                  {profile?.llmTokens.gemini.configured ? (
                    <button
                      type="button"
                      disabled={saving || loading}
                      onClick={() => {
                        setGeminiKey('');
                        setClearGemini(true);
                        setNotice(null);
                      }}
                      className="rounded-full border border-divider/70 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      Clear
                    </button>
                  ) : null}
                </span>
                <input
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    setClearGemini(false);
                  }}
                  placeholder={loading ? 'Loading…' : placeholders.gemini}
                  autoComplete="off"
                  disabled={saving || loading}
                  className="focus-ring h-11 w-full rounded-xl border border-divider/70 bg-white px-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:opacity-60"
                />
                <span className="text-xs text-muted">
                  {clearGemini
                    ? 'Will clear on save.'
                    : profile?.llmTokens.gemini.configured
                      ? 'Token configured (enter a new value to replace).'
                      : 'No token set.'}
                </span>
              </label>

              <label className="grid gap-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">Anthropic token</span>
                  {profile?.llmTokens.anthropic.configured ? (
                    <button
                      type="button"
                      disabled={saving || loading}
                      onClick={() => {
                        setAnthropicKey('');
                        setClearAnthropic(true);
                        setNotice(null);
                      }}
                      className="rounded-full border border-divider/70 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      Clear
                    </button>
                  ) : null}
                </span>
                <input
                  value={anthropicKey}
                  onChange={(e) => {
                    setAnthropicKey(e.target.value);
                    setClearAnthropic(false);
                  }}
                  placeholder={loading ? 'Loading…' : placeholders.anthropic}
                  autoComplete="off"
                  disabled={saving || loading}
                  className="focus-ring h-11 w-full rounded-xl border border-divider/70 bg-white px-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:opacity-60"
                />
                <span className="text-xs text-muted">
                  {clearAnthropic
                    ? 'Will clear on save.'
                    : profile?.llmTokens.anthropic.configured
                      ? 'Token configured (enter a new value to replace).'
                      : 'No token set.'}
                </span>
              </label>
            </div>
          )}
        </div>

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => {
              void save();
            }}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                <span>Saving…</span>
              </span>
            ) : (
              'Save tokens'
            )}
          </button>
        </div>
      </div>

      {!isDesktopEnv ? (
        <div className="mt-8 border-t border-divider/70 pt-6">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Password</div>

            <div className="grid gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-900">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordNotice(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={10}
                  disabled={changingPassword}
                  className="focus-ring h-11 w-full rounded-xl border border-divider/70 bg-white px-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:opacity-60"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-900">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordNotice(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={10}
                  disabled={changingPassword}
                  className="focus-ring h-11 w-full rounded-xl border border-divider/70 bg-white px-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:opacity-60"
                />
                <span className="text-xs text-muted">
                  Minimum 10 characters. Use lowercase and uppercase letters, digits, and symbols.
                </span>
              </label>
            </div>

            {passwordError ? <p className="text-sm font-medium text-red-700">{passwordError}</p> : null}
            {passwordNotice ? <p className="text-sm font-medium text-emerald-700">{passwordNotice}</p> : null}

            <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={changingPassword}
              onClick={() => {
                void changePassword();
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
            >
              {changingPassword ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                  <span>Updating…</span>
                </span>
              ) : (
                'Update password'
              )}
            </button>
          </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
