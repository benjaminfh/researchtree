import { simpleGit } from 'simple-git';
import { INITIAL_BRANCH, PROJECT_FILES } from './constants.js';
import { createNodeRecord, writeNodeRecord } from './nodes.js';
import type { BranchSummary, NodeRecord } from './types.js';
import {
  assertProjectExists,
  buildCommitMessage,
  ensureCleanWorkingTree,
  ensureGitUserConfig,
  getCurrentBranchName,
  getProjectPath,
  readNodesFromRef
} from './utils.js';

export async function getCurrentBranch(projectId: string): Promise<string> {
  return getCurrentBranchName(projectId);
}

export async function createBranch(projectId: string, branchName: string, fromRef?: string): Promise<void> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    throw new Error(`Branch ${branchName} already exists`);
  }

  const currentBranch = await getCurrentBranchName(projectId);
  const sourceRef = fromRef ?? currentBranch;
  if (sourceRef !== currentBranch) {
    await git.checkout(sourceRef);
  }
  await git.checkoutLocalBranch(branchName);
}

export async function switchBranch(projectId: string, branchName: string): Promise<void> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const branches = await git.branchLocal();
  if (!branches.all.includes(branchName)) {
    throw new Error(`Branch ${branchName} does not exist`);
  }
  await git.checkout(branchName);
}

export async function listBranches(projectId: string): Promise<BranchSummary[]> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const branches = await git.branchLocal();

  const summaries: BranchSummary[] = [];
  for (const name of branches.all) {
    const headCommit = (await git.revparse([name])).trim();
    const nodes = await readNodesFromRef(projectId, name);
    summaries.push({
      name,
      headCommit,
      nodeCount: nodes.length,
      isTrunk: name === INITIAL_BRANCH
    });
  }
  return summaries;
}

export async function mergeBranch(projectId: string, sourceBranch: string, mergeSummary: string): Promise<NodeRecord> {
  if (!mergeSummary) {
    throw new Error('mergeSummary is required');
  }

  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  await ensureCleanWorkingTree(projectId);
  await ensureGitUserConfig(projectId);

  const branches = await git.branchLocal();
  if (!branches.all.includes(sourceBranch)) {
    throw new Error(`Branch ${sourceBranch} does not exist`);
  }

  const targetBranch = await getCurrentBranchName(projectId);
  if (targetBranch === sourceBranch) {
    throw new Error('Cannot merge a branch into itself');
  }

  const targetNodes = await readNodesFromRef(projectId, targetBranch);
  const sourceNodes = await readNodesFromRef(projectId, sourceBranch);
  const parentId = targetNodes[targetNodes.length - 1]?.id ?? null;
  const targetIds = new Set(targetNodes.map((node) => node.id));
  const sourceSpecific = sourceNodes.filter((node) => !targetIds.has(node.id));
  const sourceCommit = (await git.revparse([sourceBranch])).trim();

  try {
    await git.merge(['-s', 'ours', '--no-commit', sourceBranch]);
    const mergeNode = createNodeRecord(
      {
        type: 'merge',
        mergeFrom: sourceBranch,
        mergeSummary,
        sourceCommit,
        sourceNodeIds: sourceSpecific.map((node) => node.id)
      },
      parentId
    );
    await writeNodeRecord(projectId, mergeNode);
    await git.add([PROJECT_FILES.nodes]);
    await git.commit(buildCommitMessage(mergeNode));
    return mergeNode;
  } catch (error) {
    await git.raw(['merge', '--abort']).catch(() => undefined);
    throw error;
  }
}
