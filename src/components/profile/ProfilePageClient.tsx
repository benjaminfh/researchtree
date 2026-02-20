// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import { useEffect, useMemo, useState } from 'react';

type ProfileResponse = {
  user: { id: string; email: string | null };
  llmTokens: {
    openai: { configured: boolean };
    gemini: { configured: boolean };
    anthropic: { configured: boolean };
  };
  systemPrompt: { mode: 'append' | 'replace'; prompt: string | null };
  updatedAt: string | null;
};

const mask = '••••••••••••••••';

export function ProfilePageClient({ email }: { email: string | null }) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSystemPrompt, setSavingSystemPrompt] = useState(false);
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
  const [systemPromptMode, setSystemPromptMode] = useState<'append' | 'replace'>('append');
  const [systemPromptText, setSystemPromptText] = useState('');
  const showTokenLoading = loading && !profile;

  const placeholders = useMemo(() => {
    return {
      openai: profile?.llmTokens.openai.configured ? mask : 'Not set',
      gemini: profile?.llmTokens.gemini.configured ? mask : 'Not set',
      anthropic: profile?.llmTokens.anthropic.configured ? mask : 'Not set'
    };
  }, [profile]);

  const loadProfile = async () => {
    const res = await fetch('/api/profile');
    if (!res.ok) throw new Error('Failed to load profile');
    const body = (await res.json()) as ProfileResponse;
    setProfile(body);
    setSystemPromptMode(body.systemPrompt?.mode ?? 'append');
    setSystemPromptText(body.systemPrompt?.prompt ?? '');
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        await loadProfile();
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

  const saveTokens = async () => {
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

      await loadProfile();
      setOpenaiKey('');
      setGeminiKey('');
      setAnthropicKey('');
      setClearOpenai(false);
      setClearGemini(false);
      setClearAnthropic(false);
      setNotice('Tokens saved.');
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveSystemPrompt = async () => {
    setSavingSystemPrompt(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPromptMode,
          systemPrompt: systemPromptText.trim() ? systemPromptText : null
        })
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || 'Failed to save system prompt');
      }
      await loadProfile();
      setNotice('System prompt settings saved.');
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to save system prompt');
    } finally {
      setSavingSystemPrompt(false);
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
              <div className="h-11 rounded-xl bg-slate-200/60" />
              <div className="h-11 rounded-xl bg-slate-200/60" />
              <div className="h-11 rounded-xl bg-slate-200/60" />
            </div>
          ) : (
            <div className="grid gap-3">
              {[
                ['OpenAI token', openaiKey, setOpenaiKey, clearOpenai, setClearOpenai, profile?.llmTokens.openai.configured, placeholders.openai],
                ['Gemini token', geminiKey, setGeminiKey, clearGemini, setClearGemini, profile?.llmTokens.gemini.configured, placeholders.gemini],
                ['Anthropic token', anthropicKey, setAnthropicKey, clearAnthropic, setClearAnthropic, profile?.llmTokens.anthropic.configured, placeholders.anthropic]
              ].map(([label, value, setValue, clearFlag, setClearFlag, configured, placeholder]) => (
                <label className="grid gap-2" key={String(label)}>
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">{String(label)}</span>
                    {configured ? (
                      <button
                        type="button"
                        disabled={saving || loading}
                        onClick={() => {
                          (setValue as (value: string) => void)('');
                          (setClearFlag as (value: boolean) => void)(true);
                          setNotice(null);
                        }}
                        className="rounded-full border border-divider/70 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        Clear
                      </button>
                    ) : null}
                  </span>
                  <input
                    value={String(value)}
                    onChange={(e) => {
                      (setValue as (value: string) => void)(e.target.value);
                      (setClearFlag as (value: boolean) => void)(false);
                    }}
                    placeholder={loading ? 'Loading…' : String(placeholder)}
                    autoComplete="off"
                    disabled={saving || loading}
                    className="focus-ring h-11 w-full rounded-xl border border-divider/70 bg-white px-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:opacity-60"
                  />
                  <span className="text-xs text-muted">
                    {Boolean(clearFlag)
                      ? 'Will clear on save.'
                      : configured
                        ? 'Token configured (enter a new value to replace).'
                        : 'No token set.'}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => {
                void saveTokens();
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save tokens'}
            </button>
          </div>
        </div>

        <div className="space-y-3 border-t border-divider/70 pt-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">System Prompt</div>
          <p className="text-xs text-muted">System prompt changes affect new workspaces only.</p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || savingSystemPrompt}
              onClick={() => setSystemPromptMode('append')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                systemPromptMode === 'append' ? 'bg-primary text-white' : 'border border-divider/70 text-slate-700'
              }`}
            >
              Append mode
            </button>
            <button
              type="button"
              disabled={loading || savingSystemPrompt}
              onClick={() => setSystemPromptMode('replace')}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                systemPromptMode === 'replace' ? 'bg-primary text-white' : 'border border-divider/70 text-slate-700'
              }`}
            >
              Replace mode
            </button>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-slate-900">Custom prompt</span>
            <textarea
              value={systemPromptText}
              onChange={(e) => setSystemPromptText(e.target.value)}
              placeholder="Optional: add a custom system prompt"
              rows={6}
              disabled={loading || savingSystemPrompt}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !savingSystemPrompt && !loading) {
                  event.preventDefault();
                  void saveSystemPrompt();
                }
              }}
              className="focus-ring w-full rounded-xl border border-divider/70 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:opacity-60"
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading || savingSystemPrompt}
              onClick={() => setSystemPromptText('')}
              className="rounded-full border border-divider/70 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Clear custom prompt
            </button>
            <button
              type="button"
              disabled={loading || savingSystemPrompt}
              onClick={() => {
                void saveSystemPrompt();
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
            >
              {savingSystemPrompt ? 'Saving…' : 'Save system prompt'}
            </button>
          </div>
        </div>

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}
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
                {changingPassword ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
