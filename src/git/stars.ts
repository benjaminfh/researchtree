import { promises as fs } from 'fs';
import { simpleGit } from 'simple-git';
import { INITIAL_BRANCH, PROJECT_FILES } from './constants';
import { assertProjectExists, ensureGitUserConfig, forceCheckoutRef, getCurrentBranchName, getProjectFilePath, getProjectPath } from './utils';

interface StarsFile {
  starredNodeIds: string[];
}

function normalizeIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export async function getStarredNodeIds(projectId: string): Promise<string[]> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const raw =
    (await git.show([`${INITIAL_BRANCH}:${PROJECT_FILES.stars}`]).catch(() => '')) ||
    (await fs.readFile(getProjectFilePath(projectId, 'stars'), 'utf-8').catch(() => ''));
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as StarsFile;
    return normalizeIds(parsed.starredNodeIds ?? []);
  } catch {
    return [];
  }
}

export async function setStarredNodeIds(projectId: string, starredNodeIds: string[]): Promise<string[]> {
  await assertProjectExists(projectId);
  const next = normalizeIds(starredNodeIds);
  const git = simpleGit(getProjectPath(projectId));
  const currentBranch = await getCurrentBranchName(projectId).catch(() => INITIAL_BRANCH);

  await forceCheckoutRef(projectId, INITIAL_BRANCH);

  const filePath = getProjectFilePath(projectId, 'stars');
  await fs.writeFile(filePath, JSON.stringify({ starredNodeIds: next }, null, 2) + '\n');
  await ensureGitUserConfig(projectId);
  await git.add([PROJECT_FILES.stars]);
  await git.commit(`[stars] Update starred nodes (${next.length})`);

  if (currentBranch !== INITIAL_BRANCH) {
    await forceCheckoutRef(projectId, currentBranch);
  }
  return next;
}

export async function toggleStar(projectId: string, nodeId: string): Promise<string[]> {
  const current = await getStarredNodeIds(projectId);
  const set = new Set(current);
  if (set.has(nodeId)) {
    set.delete(nodeId);
  } else {
    set.add(nodeId);
  }
  return setStarredNodeIds(projectId, Array.from(set));
}
