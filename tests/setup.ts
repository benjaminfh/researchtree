import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// Tests should not hit Supabase/PostgREST; keep PG migration flags disabled by default.
process.env.RT_STORE = 'git';
process.env.RT_SHADOW_WRITE = 'false';

vi.mock('@/src/server/auth', () => ({
  getUserOrNull: vi.fn(async () => ({ id: 'test-user-id', email: 'test@example.com' })),
  requireUser: vi.fn(async () => ({ id: 'test-user-id', email: 'test@example.com' }))
}));

vi.mock('@/src/server/authz', () => ({
  requireProjectAccess: vi.fn(async () => undefined)
}));

function createInMemoryStorage() {
  let store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store = new Map();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    }
  } as Storage;
}

function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  const current = (window as any)[name];
  if (current && typeof current.clear === 'function') {
    return;
  }
  Object.defineProperty(window, name, {
    value: createInMemoryStorage(),
    configurable: true
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
