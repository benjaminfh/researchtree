// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { promises as fs } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

async function listRouteFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRouteFiles(fullPath)));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

describe('auth gating', () => {
  it('requires auth for all app/api routes', async () => {
    const repoRoot = process.cwd();
    const apiRoot = path.join(repoRoot, 'app', 'api');

    const routeFiles = await listRouteFiles(apiRoot);
    expect(routeFiles.length).toBeGreaterThan(0);

    const allowUnauthed: string[] = ['app/api/health/route.ts'];

    const missing: string[] = [];
    for (const filePath of routeFiles) {
      const rel = path.relative(repoRoot, filePath);
      if (allowUnauthed.includes(rel)) continue;
      const content = await fs.readFile(filePath, 'utf8');
      if (!content.includes('requireUser(')) {
        missing.push(rel);
      }
    }

    expect(missing).toEqual([]);
  });
});
