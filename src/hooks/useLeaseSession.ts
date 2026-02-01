// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

'use client';

import { useEffect, useMemo, useState } from 'react';
import { storageKey } from '@/src/config/app';

const createSessionId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `lease-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
};

export function useLeaseSession(projectId: string, enabled: boolean) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const key = useMemo(() => storageKey(`lease-session:${projectId}`), [projectId]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setSessionId(null);
      return;
    }
    const existing = window.sessionStorage.getItem(key);
    if (existing) {
      setSessionId(existing);
      return;
    }
    const next = createSessionId();
    window.sessionStorage.setItem(key, next);
    setSessionId(next);
  }, [enabled, key]);

  return {
    sessionId,
    ready: !enabled || Boolean(sessionId)
  };
}
