// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { useEffect, useState } from 'react';

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const now = Date.now().toString(16);
  const random = Math.random().toString(16).slice(2, 10);
  return `rt-${now}-${random}`;
}

export function useLeaseSession(projectId: string): string | null {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = `researchtree:lease-session:${projectId}`;
    let stored = window.localStorage.getItem(key);
    if (!stored) {
      stored = generateSessionId();
      window.localStorage.setItem(key, stored);
    }
    setSessionId(stored);
  }, [projectId]);

  return sessionId;
}
