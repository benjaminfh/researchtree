import { simpleGit } from 'simple-git';
import { INITIAL_BRANCH, PROJECT_FILES } from './constants';
import { createNodeRecord, writeNodeRecord } from './nodes';
import type { BranchSummary, NodeRecord } from './types';
import {
  assertProjectExists,
  buildCommitMessage,
  ensureCleanWorkingTree,
  ensureGitUserConfig,
  getCurrentBranchName,
  getProjectPath,
  readNodesFromRef
} from './utils';

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

  const summaries: (BranchSummary & { _lastModifiedAt: number; _createdAt: number })[] = [];
  for (const name of branches.all) {
    const headCommit = (await git.revparse([name])).trim();
    const nodes = await readNodesFromRef(projectId, name);
    const lastModifiedAt = await getRefCommitTimestamp(git, headCommit);
    const createdAt = await getBranchCreatedTimestamp(git, name);
    summaries.push({
      name,
      headCommit,
      nodeCount: nodes.length,
      isTrunk: name === INITIAL_BRANCH,
      _lastModifiedAt: lastModifiedAt,
      _createdAt: createdAt
    });
  }
  return summaries
    .sort((a, b) => {
      if (a.isTrunk && !b.isTrunk) return -1;
      if (!a.isTrunk && b.isTrunk) return 1;
      if (a._lastModifiedAt !== b._lastModifiedAt) return b._lastModifiedAt - a._lastModifiedAt;
      if (a._createdAt !== b._createdAt) return b._createdAt - a._createdAt;
      return a.name.localeCompare(b.name);
    })
    .map(({ _lastModifiedAt: _lm, _createdAt: _c, ...rest }) => rest);
}

async function getRefCommitTimestamp(git: ReturnType<typeof simpleGit>, ref: string): Promise<number> {
  const raw = await git.raw(['show', '-s', '--format=%ct', ref]).catch(() => '');
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getBranchCreatedTimestamp(git: ReturnType<typeof simpleGit>, branch: string): Promise<number> {
  const raw = await git.raw(['reflog', 'show', '--date=unix', '--format=%ct', '--reverse', branch]).catch(() => '');
  const firstLine = raw.split('\n').find((line) => line.trim().length > 0) ?? '';
  const parsed = Number.parseInt(firstLine.trim(), 10);
  if (Number.isFinite(parsed)) return parsed;
  // Fallback: if reflog isn't available, treat "created" as last modified.
  return getRefCommitTimestamp(git, branch);
}

interface MergeOptions {
  targetBranch?: string;
  applyArtefact?: boolean;
}

export async function mergeBranch(
  projectId: string,
  sourceBranch: string,
  mergeSummary: string,
  targetBranchOrOptions?: string | MergeOptions
): Promise<NodeRecord> {
  if (!mergeSummary) {
    throw new Error('mergeSummary is required');
  }

  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  await ensureCleanWorkingTree(projectId);
  await ensureGitUserConfig(projectId);

  const branches = await git.branchLocal();
  const targetBranch = typeof targetBranchOrOptions === 'string' ? targetBranchOrOptions : targetBranchOrOptions?.targetBranch;
  const applyArtefact =
    typeof targetBranchOrOptions === 'object' && targetBranchOrOptions !== null ? targetBranchOrOptions.applyArtefact ?? false : false;

  if (!branches.all.includes(sourceBranch)) {
    throw new Error(`Branch ${sourceBranch} does not exist`);
  }

  const target = targetBranch ?? (await getCurrentBranchName(projectId));
  if (target === sourceBranch) {
    throw new Error('Cannot merge a branch into itself');
  }
  if (targetBranch && !branches.all.includes(targetBranch)) {
    throw new Error(`Target branch ${targetBranch} does not exist`);
  }

  if ((await getCurrentBranchName(projectId)) !== target) {
    await git.checkout(target);
  }

  const targetNodes = await readNodesFromRef(projectId, target);
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
        sourceNodeIds: sourceSpecific.map((node) => node.id),
        applyArtefact
      },
      parentId,
      target
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
