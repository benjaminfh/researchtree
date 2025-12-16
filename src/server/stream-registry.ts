const controllers = new Map<string, AbortController>();

export function registerStream(projectId: string, controller: AbortController): void {
  const existing = controllers.get(projectId);
  if (existing) {
    existing.abort();
  }
  controllers.set(projectId, controller);
}

export function releaseStream(projectId: string): void {
  controllers.delete(projectId);
}

export function abortStream(projectId: string): boolean {
  const controller = controllers.get(projectId);
  if (!controller) {
    return false;
  }
  controller.abort();
  controllers.delete(projectId);
  return true;
}
