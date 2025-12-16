const controllers = new Map<string, AbortController>();

function key(projectId: string, ref?: string): string {
  return ref ? `${projectId}::${ref}` : projectId;
}

export function registerStream(projectId: string, controller: AbortController, ref?: string): void {
  const mapKey = key(projectId, ref);
  const existing = controllers.get(mapKey);
  if (existing) {
    existing.abort();
  }
  controllers.set(mapKey, controller);
}

export function releaseStream(projectId: string, ref?: string): void {
  controllers.delete(key(projectId, ref));
}

export function abortStream(projectId: string, ref?: string): boolean {
  const mapKey = key(projectId, ref);
  const controller = controllers.get(mapKey);
  if (!controller) {
    return false;
  }
  controller.abort();
  controllers.delete(mapKey);
  return true;
}
