import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { COMMIT_SUMMARY_LIMIT, DEFAULT_USER, PROJECTS_ROOT, PROJECT_FILES, INITIAL_BRANCH } from './constants';
import type { NodeInput, NodeRecord, ProjectMetadata } from './types';

const projectRootOverrides = new Map<string, string>();

export function registerProjectRoot(projectId: string, rootPath: string): void {
  projectRootOverrides.set(projectId, path.resolve(rootPath));
}

export function unregisterProjectRoot(projectId: string): void {
  projectRootOverrides.delete(projectId);
}

function resolveProjectRoot(projectId: string): string {
  return projectRootOverrides.get(projectId) ?? PROJECTS_ROOT;
}

export async function ensureProjectsRoot(root: string = PROJECTS_ROOT): Promise<void> {
  await fs.mkdir(root, { recursive: true });
}

export function getProjectPath(projectId: string): string {
  return path.resolve(resolveProjectRoot(projectId), projectId);
}

export function getProjectFilePath(projectId: string, fileKey: keyof typeof PROJECT_FILES): string {
  return path.resolve(getProjectPath(projectId), PROJECT_FILES[fileKey]);
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function assertProjectExists(projectId: string): Promise<void> {
  const exists = await pathExists(getProjectPath(projectId));
  if (!exists) {
    throw new Error(`Project ${projectId} does not exist`);
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export function parseNodes(content: string): NodeRecord[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as NodeRecord);
}

export async function readNodesFromRef(projectId: string, ref?: string): Promise<NodeRecord[]> {
  const repoPath = getProjectPath(projectId);
  if (!ref || ref === 'WORKING_TREE') {
    const content = await fs.readFile(getProjectFilePath(projectId, 'nodes'), 'utf-8').catch(() => '');
    return parseNodes(content ?? '');
  }

  const git = simpleGit(repoPath);
  try {
    const content = await git.show([`${ref}:${PROJECT_FILES.nodes}`]);
    return parseNodes(content);
  } catch {
    return [];
  }
}

export function buildCommitMessage(node: NodeRecord): string {
  let summary = '';
  if (node.type === 'message') {
    summary = `${node.role}: ${node.content}`;
  } else if (node.type === 'state') {
    summary = `Artefact snapshot`;
  } else {
    summary = `Merge ${node.mergeFrom}: ${node.mergeSummary}`;
  }

  if (summary.length > COMMIT_SUMMARY_LIMIT) {
    summary = `${summary.slice(0, COMMIT_SUMMARY_LIMIT - 3)}...`;
  }

  return `[${node.type}] ${summary}`;
}

export async function ensureGitUserConfig(projectId: string): Promise<void> {
  const repoPath = getProjectPath(projectId);
  const git = simpleGit(repoPath);
  const name = await git.raw(['config', '--get', 'user.name']).catch(() => '');
  if (!name.trim()) {
    await git.addConfig('user.name', DEFAULT_USER.name);
  }
  const email = await git.raw(['config', '--get', 'user.email']).catch(() => '');
  if (!email.trim()) {
    await git.addConfig('user.email', DEFAULT_USER.email);
  }
}

export async function ensureCleanWorkingTree(projectId: string): Promise<void> {
  const git = simpleGit(getProjectPath(projectId));
  const status = await git.status();
  if (!status.isClean()) {
    throw new Error('Working tree must be clean before performing this operation');
  }
}

export async function getCurrentBranchName(projectId: string): Promise<string> {
  const git = simpleGit(getProjectPath(projectId));
  const name = await git.revparse(['--abbrev-ref', 'HEAD']).catch(() => INITIAL_BRANCH);
  const trimmed = name.trim();
  if (!trimmed || trimmed === 'HEAD') {
    return INITIAL_BRANCH;
  }
  return trimmed;
}

export async function forceCheckoutRef(projectId: string, ref: string): Promise<void> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  try {
    await git.raw(['checkout', '-f', ref]);
  } catch {
    await git.raw(['reset', '--hard']).catch(() => undefined);
    await git.raw(['clean', '-fd']).catch(() => undefined);
    await git.raw(['checkout', '-f', ref]);
  }
}

export function isTrunk(branch: string): boolean {
  return branch === INITIAL_BRANCH;
}

export function assertNodeInput(input: NodeInput): void {
  if (input.type === 'message') {
    if (!input.content || !input.role) {
      throw new Error('Message nodes require role and content');
    }
  } else if (input.type === 'state') {
    if (!input.artefactSnapshot) {
      throw new Error('State nodes require artefactSnapshot');
    }
  } else if (input.type === 'merge') {
    if (!input.mergeFrom || !input.mergeSummary) {
      throw new Error('Merge nodes require mergeFrom and mergeSummary');
    }
    if (!input.sourceCommit) {
      throw new Error('Merge nodes require sourceCommit');
    }
    if (!input.sourceNodeIds) {
      throw new Error('Merge nodes require sourceNodeIds');
    }
  }
}

interface NodeCommitOptions {
  parent?: boolean;
}

export async function getCommitHashForNode(projectId: string, ref: string, nodeId: string, options?: NodeCommitOptions): Promise<string> {
  await assertProjectExists(projectId);
  const nodes = await readNodesFromRef(projectId, ref);
  const idx = nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    throw new Error(`Node ${nodeId} not found on ref ${ref}`);
  }

  const git = simpleGit(getProjectPath(projectId));
  const revListRaw = await git.raw(['rev-list', '--reverse', ref]);
  const revs = revListRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Account for the initial repo commit with no nodes.
  let commitIndex = idx + 1;
  if (options?.parent) {
    commitIndex -= 1;
  }
  if (commitIndex >= revs.length || commitIndex < 0) {
    throw new Error(`Unable to locate commit for node ${nodeId} on ref ${ref}`);
  }
  return revs[commitIndex];
}
