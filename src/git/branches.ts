import { simpleGit } from 'simple-git';
import { INITIAL_BRANCH, PROJECT_FILES } from './constants';
import { createNodeRecord, writeNodeRecord } from './nodes';
import type { BranchSummary, NodeRecord } from './types';
import type { LLMProvider } from '@/src/shared/llmProvider';
import { isSupportedModelForProvider } from '@/src/shared/llmCapabilities';
import { getDefaultModelForProvider, resolveLLMProvider } from '@/src/server/llm';
import {
  assertProjectExists,
  buildCommitMessage,
  ensureGitUserConfig,
  forceCheckoutRef,
  getCurrentBranchName,
  getProjectPath,
  readNodesFromRef
} from './utils';
import { getArtefactFromRef } from './artefact';
import { readBranchConfigMap, setBranchConfig } from './branchConfig';

function buildLineDiff(base: string, incoming: string): string {
  const baseLines = base.length > 0 ? base.split(/\r?\n/) : [];
  const incomingLines = incoming.length > 0 ? incoming.split(/\r?\n/) : [];
  const m = baseLines.length;
  const n = incomingLines.length;
  if (m === 0 && n === 0) {
    return '';
  }
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (baseLines[i] === incomingLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (baseLines[i] === incomingLines[j]) {
      out.push(` ${baseLines[i]}`);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${baseLines[i]}`);
      i += 1;
    } else {
      out.push(`+${incomingLines[j]}`);
      j += 1;
    }
  }
  while (i < m) {
    out.push(`-${baseLines[i]}`);
    i += 1;
  }
  while (j < n) {
    out.push(`+${incomingLines[j]}`);
    j += 1;
  }
  return out.join('\n');
}

export async function getCurrentBranch(projectId: string): Promise<string> {
  return getCurrentBranchName(projectId);
}

export async function createBranch(
  projectId: string,
  branchName: string,
  fromRef?: string,
  options?: { provider?: LLMProvider; model?: string }
): Promise<void> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    throw new Error(`Branch ${branchName} already exists`);
  }

  const currentBranch = await getCurrentBranchName(projectId);
  const sourceRef = fromRef ?? currentBranch;
  await forceCheckoutRef(projectId, sourceRef);
  await git.checkoutLocalBranch(branchName);

  const configMap = await readBranchConfigMap(projectId);
  const fallbackProvider = resolveLLMProvider();
  const sourceConfig = configMap[sourceRef];
  const provider = options?.provider ?? sourceConfig?.provider ?? fallbackProvider;
  const modelCandidate =
    options?.model ?? (provider === sourceConfig?.provider ? sourceConfig?.model ?? '' : '');
  const model = isSupportedModelForProvider(provider, modelCandidate)
    ? modelCandidate
    : getDefaultModelForProvider(provider);
  await setBranchConfig(projectId, branchName, { provider, model });
}

export async function switchBranch(projectId: string, branchName: string): Promise<void> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const branches = await git.branchLocal();
  if (!branches.all.includes(branchName)) {
    throw new Error(`Branch ${branchName} does not exist`);
  }
  await forceCheckoutRef(projectId, branchName);
}

export async function listBranches(projectId: string): Promise<BranchSummary[]> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const branches = await git.branchLocal();
  const configMap = await readBranchConfigMap(projectId);
  const fallbackProvider = resolveLLMProvider();

  const summaries: (BranchSummary & { _lastModifiedAt: number; _createdAt: number })[] = [];
  for (const name of branches.all) {
    const headCommit = (await git.revparse([name])).trim();
    const nodes = await readNodesFromRef(projectId, name);
    const lastModifiedAt = await getRefCommitTimestamp(git, headCommit);
    const createdAt = await getBranchCreatedTimestamp(git, name);
    const config = configMap[name];
    const provider = config?.provider ?? fallbackProvider;
    const modelCandidate = config?.model ?? '';
    const model = isSupportedModelForProvider(provider, modelCandidate)
      ? modelCandidate
      : getDefaultModelForProvider(provider);
    summaries.push({
      name,
      headCommit,
      nodeCount: nodes.length,
      isTrunk: name === INITIAL_BRANCH,
      provider,
      model,
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
  sourceAssistantNodeId?: string;
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
  await ensureGitUserConfig(projectId);

  const branches = await git.branchLocal();
  const targetBranch = typeof targetBranchOrOptions === 'string' ? targetBranchOrOptions : targetBranchOrOptions?.targetBranch;
  const sourceAssistantNodeId =
    typeof targetBranchOrOptions === 'object' && targetBranchOrOptions !== null ? targetBranchOrOptions.sourceAssistantNodeId : undefined;

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

  await forceCheckoutRef(projectId, target);

  const targetNodes = await readNodesFromRef(projectId, target);
  const sourceCommit = (await git.revparse([sourceBranch])).trim();
  const sourceNodes = await readNodesFromRef(projectId, sourceCommit);
  const parentId = targetNodes[targetNodes.length - 1]?.id ?? null;
  const targetIds = new Set(targetNodes.map((node) => node.id));
  const sourceSpecific = sourceNodes.filter((node) => !targetIds.has(node.id));

  const resolvedPayloadNode =
    sourceAssistantNodeId?.trim().length
      ? sourceSpecific.find((node) => node.type === 'message' && node.id === sourceAssistantNodeId)
      : [...sourceSpecific]
          .reverse()
          .find((node) => node.type === 'message' && node.role === 'assistant' && node.content?.trim().length);

  if (sourceAssistantNodeId?.trim().length) {
    if (!resolvedPayloadNode) {
      throw new Error(`Source assistant node ${sourceAssistantNodeId} not found on ${sourceBranch} (or is not unique to that branch)`);
    }
    if (resolvedPayloadNode.type !== 'message' || resolvedPayloadNode.role !== 'assistant') {
      throw new Error('sourceAssistantNodeId must reference an assistant message node');
    }
  } else if (!resolvedPayloadNode) {
    throw new Error(`No assistant message found on ${sourceBranch} to merge`);
  }

  const mergedAssistantNodeId =
    resolvedPayloadNode && resolvedPayloadNode.type === 'message' && resolvedPayloadNode.role === 'assistant'
      ? resolvedPayloadNode.id
      : undefined;
  const mergedAssistantContent =
    resolvedPayloadNode && resolvedPayloadNode.type === 'message' && resolvedPayloadNode.role === 'assistant'
      ? resolvedPayloadNode.content
      : undefined;

  const [targetArtefact, sourceArtefact] = await Promise.all([
    getArtefactFromRef(projectId, target),
    getArtefactFromRef(projectId, sourceCommit)
  ]);
  const canvasDiff = buildLineDiff(targetArtefact, sourceArtefact);

  try {
    await git.merge(['-s', 'ours', '--no-commit', sourceBranch]);
    const mergeNode = createNodeRecord(
      {
        type: 'merge',
        mergeFrom: sourceBranch,
        mergeSummary,
        sourceCommit,
        sourceNodeIds: sourceSpecific.map((node) => node.id),
        canvasDiff: canvasDiff || undefined,
        mergedAssistantNodeId,
        mergedAssistantContent
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
