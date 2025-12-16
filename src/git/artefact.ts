import { promises as fs } from 'fs';
import { simpleGit } from 'simple-git';
import { INITIAL_BRANCH, PROJECT_FILES } from './constants';
import { appendNode } from './nodes';
import { assertProjectExists, getCurrentBranchName, getProjectFilePath, getProjectPath } from './utils';

export async function getArtefact(projectId: string): Promise<string> {
  await assertProjectExists(projectId);
  const artefactPath = getProjectFilePath(projectId, 'artefact');
  try {
    return await fs.readFile(artefactPath, 'utf-8');
  } catch {
    return '';
  }
}

export async function updateArtefact(projectId: string, content: string, ref?: string): Promise<void> {
  await assertProjectExists(projectId);
  const targetBranch = ref ?? INITIAL_BRANCH;
  if (targetBranch !== INITIAL_BRANCH) {
    throw new Error('Artefact updates are only allowed on the trunk (main) branch');
  }

  const git = simpleGit(getProjectPath(projectId));
  const currentBranch = await getCurrentBranchName(projectId);
  if (currentBranch !== INITIAL_BRANCH) {
    await git.checkout(INITIAL_BRANCH);
  }

  const artefactPath = getProjectFilePath(projectId, 'artefact');
  await fs.writeFile(artefactPath, content ?? '');

  const snapshot = (await git.raw(['hash-object', '-w', PROJECT_FILES.artefact])).trim();

  await appendNode(
    projectId,
    {
      type: 'state',
      artefactSnapshot: snapshot
    },
    { extraFiles: [PROJECT_FILES.artefact], ref: INITIAL_BRANCH }
  );
}
