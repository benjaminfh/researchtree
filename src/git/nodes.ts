import { promises as fs } from 'fs';
import { simpleGit } from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { PROJECT_FILES } from './constants';
import {
  assertProjectExists,
  assertNodeInput,
  buildCommitMessage,
  ensureGitUserConfig,
  getProjectFilePath,
  getProjectPath,
  readNodesFromRef
} from './utils';
import type { NodeInput, NodeRecord } from './types';

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

export async function getLastNode(projectId: string, ref?: string): Promise<NodeRecord | undefined> {
  const nodes = ref ? await readNodesFromRef(projectId, ref) : await getNodes(projectId);
  return nodes[nodes.length - 1];
}

export async function getNodeCount(projectId: string, ref?: string): Promise<number> {
  const nodes = ref ? await readNodesFromRef(projectId, ref) : await getNodes(projectId);
  return nodes.length;
}
