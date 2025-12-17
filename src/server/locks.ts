const projectLocks = new Map<string, Promise<void>>();

export async function withProjectLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const previous = projectLocks.get(projectId) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  projectLocks.set(projectId, current);
  await previous;

  try {
    return await fn();
  } finally {
    release();
    if (projectLocks.get(projectId) === current) {
      projectLocks.delete(projectId);
    }
  }
}
