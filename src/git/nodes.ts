// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { promises as fs } from 'fs';
import { simpleGit } from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_USER, PROJECT_FILES } from './constants';
import {
  assertProjectExists,
  assertNodeInput,
  buildCommitMessage,
  ensureGitUserConfig,
  getProjectFilePath,
  getProjectPath,
  parseNodes,
  readNodesFromRef
} from './utils';
import type { NodeInput, NodeRecord } from './types';
import { gitExec } from './gitExec';

export async function getNodes(projectId: string): Promise<NodeRecord[]> {
  await assertProjectExists(projectId);
  const filePath = getProjectFilePath(projectId, 'nodes');
  const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as NodeRecord);
}

export async function getNode(projectId: string, nodeId: string): Promise<NodeRecord | null> {
  const nodes = await getNodes(projectId);
  return nodes.find((node) => node.id === nodeId) ?? null;
}

export function createNodeRecord(input: NodeInput, parentId: string | null, createdOnBranch?: string): NodeRecord {
  assertNodeInput(input);
  return {
    id: uuidv4(),
    timestamp: Date.now(),
    parent: parentId,
    createdOnBranch,
    ...input
  } as NodeRecord;
}

export async function writeNodeRecord(projectId: string, node: NodeRecord): Promise<void> {
  const filePath = getProjectFilePath(projectId, 'nodes');
  const line = JSON.stringify(node);
  await fs.appendFile(filePath, `${line}\n`);
}

export async function appendNode(
  projectId: string,
  input: NodeInput,
  options?: { extraFiles?: string[]; ref?: string }
): Promise<NodeRecord> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  if (options?.ref) {
    await git.checkout(options.ref);
  }

  const nodes = await getNodes(projectId);
  const parentId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;
  const createdOnBranch = options?.ref ?? (await git.branchLocal()).current;
  const node = createNodeRecord(input, parentId, createdOnBranch);

  await writeNodeRecord(projectId, node);
  await ensureGitUserConfig(projectId);
  const files = [PROJECT_FILES.nodes, ...(options?.extraFiles ?? [])];
  await git.add(files);
  await git.commit(buildCommitMessage(node));
  return node;
}

function ensureEndsWithNewline(content: string): string {
  if (!content) return '';
  return content.endsWith('\n') ? content : `${content}\n`;
}

function toHeadsRefName(ref: string): string {
  if (ref.startsWith('refs/')) return ref;
  return `refs/heads/${ref}`;
}

export async function appendNodeToRefNoCheckout(
  projectId: string,
  ref: string,
  input: NodeInput
): Promise<NodeRecord> {
  await assertProjectExists(projectId);
  if (!ref?.trim()) {
    throw new Error('ref is required');
  }

  const repoPath = getProjectPath(projectId);
  const currentCommit = (await gitExec(repoPath, ['rev-parse', ref])).trim();

  const nodesRaw = await gitExec(repoPath, ['show', `${ref}:${PROJECT_FILES.nodes}`]).catch(() => '');
  const nodes = parseNodes(nodesRaw);
  const parentId = nodes.length > 0 ? nodes[nodes.length - 1].id : null;
  const createdOnBranch = ref;
  const node = createNodeRecord(input, parentId, createdOnBranch);

  const nextNodesContent = `${ensureEndsWithNewline(nodesRaw)}${JSON.stringify(node)}\n`;
  const blobHash = (await gitExec(repoPath, ['hash-object', '-w', '--stdin'], { input: nextNodesContent })).trim();

  const treeHash = (await gitExec(repoPath, ['rev-parse', `${currentCommit}^{tree}`])).trim();
  const lsTreeRaw = await gitExec(repoPath, ['ls-tree', '-z', treeHash]);
  const entries = lsTreeRaw.split('\0').filter(Boolean);

  const updatedEntries: string[] = [];
  let replaced = false;
  for (const entry of entries) {
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const meta = entry.slice(0, tab);
    const filePath = entry.slice(tab + 1);
    const [mode, type, hash] = meta.split(' ');
    if (!mode || !type || !hash) continue;
    if (filePath === PROJECT_FILES.nodes) {
      updatedEntries.push(`${mode} ${type} ${blobHash}\t${filePath}`);
      replaced = true;
    } else {
      updatedEntries.push(entry);
    }
  }
  if (!replaced) {
    updatedEntries.push(`100644 blob ${blobHash}\t${PROJECT_FILES.nodes}`);
  }

  const mktreeInput = `${updatedEntries.join('\0')}\0`;
  const newTreeHash = (await gitExec(repoPath, ['mktree', '-z'], { input: mktreeInput })).trim();

  const commitMessage = buildCommitMessage(node);
  const env = {
    GIT_AUTHOR_NAME: DEFAULT_USER.name,
    GIT_AUTHOR_EMAIL: DEFAULT_USER.email,
    GIT_COMMITTER_NAME: DEFAULT_USER.name,
    GIT_COMMITTER_EMAIL: DEFAULT_USER.email
  };
  const newCommit = (
    await gitExec(repoPath, ['commit-tree', newTreeHash, '-p', currentCommit, '-m', commitMessage], { env })
  ).trim();

  await gitExec(repoPath, ['update-ref', toHeadsRefName(ref), newCommit, currentCommit]);
  return node;
}

export async function getLastNode(projectId: string, ref?: string): Promise<NodeRecord | undefined> {
  const nodes = ref ? await readNodesFromRef(projectId, ref) : await getNodes(projectId);
  return nodes[nodes.length - 1];
}

export async function getNodeCount(projectId: string, ref?: string): Promise<number> {
  const nodes = ref ? await readNodesFromRef(projectId, ref) : await getNodes(projectId);
  return nodes.length;
}
