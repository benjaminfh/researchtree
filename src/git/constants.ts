// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import path from 'path';
import { APP_NAME, APP_SLUG } from '@/src/config/app';

export let PROJECTS_ROOT = process.env.RESEARCHTREE_PROJECTS_ROOT
  ? path.resolve(process.env.RESEARCHTREE_PROJECTS_ROOT)
  : path.join(process.cwd(), 'data', 'projects');
export function setProjectsRoot(rootPath: string): void {
  if (!rootPath) {
    throw new Error('projectsRoot must be a non-empty path');
  }
  PROJECTS_ROOT = path.resolve(rootPath);
}
export const INITIAL_BRANCH = 'main';

export const PROJECT_FILES = {
  nodes: 'nodes.jsonl',
  artefact: 'artefact.md',
  stars: 'stars.json',
  metadata: 'project.json',
  readme: 'README.md'
} as const;

export const DEFAULT_USER = {
  name: APP_NAME,
  email: `${APP_SLUG}@example.com`
};

export const COMMIT_SUMMARY_LIMIT = 72;
