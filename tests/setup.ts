import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => cleanup());

// Tests should not hit Supabase/PostgREST; default to git mode.
process.env.RT_STORE = 'git';

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
  const descriptor =
    Object.getOwnPropertyDescriptor(window, name) ??
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), name);
  const current = descriptor?.value as Storage | undefined;
  if (current && typeof current.clear === 'function') {
    return;
  }
  if (descriptor && descriptor.configurable === false) {
    return;
  }
  Object.defineProperty(window, name, {
    value: createInMemoryStorage(),
    configurable: true
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');

const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((handler, timeout, ...args) => {
  const safeTimeout = typeof timeout === 'number' && Number.isFinite(timeout) ? timeout : 0;
  return originalSetTimeout(handler, safeTimeout, ...args);
}) as typeof setTimeout;
