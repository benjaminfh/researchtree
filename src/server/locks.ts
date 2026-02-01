// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

const projectLocks = new Map<string, Promise<void>>();
const projectRefLocks = new Map<string, Promise<void>>();

function lockKey(projectId: string, ref?: string): string {
  return ref ? `${projectId}::${ref}` : projectId;
}

export async function acquireProjectLock(projectId: string): Promise<() => void> {
  const previous = projectLocks.get(projectId) ?? Promise.resolve();
  let releasePromise: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    releasePromise = resolve;
  });
  projectLocks.set(projectId, current);
  await previous;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releasePromise();
    if (projectLocks.get(projectId) === current) {
      projectLocks.delete(projectId);
    }
  };
}

export async function acquireProjectRefLock(projectId: string, ref?: string): Promise<() => void> {
  const key = lockKey(projectId, ref);
  const previous = projectRefLocks.get(key) ?? Promise.resolve();
  let releasePromise: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    releasePromise = resolve;
  });
  projectRefLocks.set(key, current);
  await previous;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releasePromise();
    if (projectRefLocks.get(key) === current) {
      projectRefLocks.delete(key);
    }
  };
}

export async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireProjectLock(projectId);

  try {
    return await fn();
  } finally {
    release();
  }
}

export async function withProjectRefLock<T>(projectId: string, ref: string | undefined, fn: () => Promise<T>): Promise<T> {
  const release = await acquireProjectRefLock(projectId, ref);
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function withProjectLockAndRefLock<T>(projectId: string, ref: string | undefined, fn: () => Promise<T>): Promise<T> {
  return withProjectLock(projectId, async () => withProjectRefLock(projectId, ref, fn));
}
