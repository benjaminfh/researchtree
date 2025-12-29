// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { validate as uuidValidate } from 'uuid';
import { expect } from 'vitest';
import { PROJECT_FILES } from '../../src/git/constants';
import { getProjectFilePath, getProjectPath } from '../../src/git/utils';

const BASE_TEST_PROJECTS_ROOT = process.env.RESEARCHTREE_PROJECTS_ROOT
  ? path.resolve(process.env.RESEARCHTREE_PROJECTS_ROOT)
  : path.join(process.cwd(), '.test-projects');

export function generateTestProjectName(): string {
  return `test-project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getTestProjectsRoot(suiteName: string): string {
  return path.join(BASE_TEST_PROJECTS_ROOT, suiteName);
}

export async function ensureTestProjectsRoot(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
}

export async function clearAllTestProjects(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
}

export function assertValidUUID(id: string): void {
  expect(uuidValidate(id), `Expected valid UUID but received ${id}`).toBe(true);
}

export function assertValidCommitHash(hash: string): void {
  expect(/^[0-9a-f]{40}$/i.test(hash), `Expected valid git hash but received ${hash}`).toBe(true);
}

export async function getGitLog(projectId: string): Promise<string> {
  const git = simpleGit(getProjectPath(projectId));
  const result = await git.log(['--graph', '--all', '--oneline']);
  return result.all.map((entry) => `${entry.hash} ${entry.message}`).join('\n');
}

export async function getCommitCount(projectId: string): Promise<number> {
  const git = simpleGit(getProjectPath(projectId));
  const log = await git.log();
  return log.total;
}

export async function readProjectFile(projectId: string, filenameKey: keyof typeof PROJECT_FILES): Promise<string> {
  const filePath = getProjectFilePath(projectId, filenameKey);
  return fs.readFile(filePath, 'utf-8');
}
