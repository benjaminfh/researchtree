import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { validate as uuidValidate } from 'uuid';
import { PROJECTS_ROOT, PROJECT_FILES } from '../../src/git/constants';

export function generateTestProjectName(): string {
  return `test-project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function cleanupTestProjects(): Promise<void> {
  try {
    const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metadataPath = path.join(PROJECTS_ROOT, entry.name, PROJECT_FILES.metadata);
      try {
        const metadataRaw = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataRaw) as { name?: string };
        if (metadata.name && metadata.name.startsWith('test-project-')) {
          await fs.rm(path.join(PROJECTS_ROOT, entry.name), { recursive: true, force: true });
        }
      } catch {
        // ignore unreadable metadata
      }
    }
  } catch {
    // ignore missing root
  }
}

export function assertValidUUID(id: string): void {
  expect(uuidValidate(id), `Expected valid UUID but received ${id}`).toBe(true);
}

export function assertValidCommitHash(hash: string): void {
  expect(/^[0-9a-f]{40}$/i.test(hash), `Expected valid git hash but received ${hash}`).toBe(true);
}

export async function getGitLog(projectId: string): Promise<string> {
  const git = simpleGit(path.join(PROJECTS_ROOT, projectId));
  const result = await git.log(['--graph', '--all', '--oneline']);
  return result.all.map((entry) => `${entry.hash} ${entry.message}`).join('\n');
}

export async function getCommitCount(projectId: string): Promise<number> {
  const git = simpleGit(path.join(PROJECTS_ROOT, projectId));
  const log = await git.log();
  return log.total;
}

export async function readProjectFile(projectId: string, filenameKey: keyof typeof PROJECT_FILES): Promise<string> {
  const filePath = path.join(PROJECTS_ROOT, projectId, PROJECT_FILES[filenameKey]);
  return fs.readFile(filePath, 'utf-8');
}
