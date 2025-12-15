import { promises as fs } from 'fs';
import { simpleGit } from 'simple-git';
import { INITIAL_BRANCH, PROJECT_FILES } from './constants.js';
import { appendNode } from './nodes.js';
import { assertProjectExists, getCurrentBranchName, getProjectFilePath, getProjectPath } from './utils.js';

export async function getArtefact(projectId: string): Promise<string> {
  await assertProjectExists(projectId);
  const artefactPath = getProjectFilePath(projectId, 'artefact');
  try {
    return await fs.readFile(artefactPath, 'utf-8');
  } catch {
    return '';
  }
}

export async function updateArtefact(projectId: string, content: string): Promise<void> {
  await assertProjectExists(projectId);
  const currentBranch = await getCurrentBranchName(projectId);
  if (currentBranch !== INITIAL_BRANCH) {
    throw new Error('Artefact updates are only allowed on the trunk (main) branch');
  }

  const artefactPath = getProjectFilePath(projectId, 'artefact');
  await fs.writeFile(artefactPath, content ?? '');

  const git = simpleGit(getProjectPath(projectId));
  const snapshot = (await git.hashObject(artefactPath, true)).trim();

  await appendNode(
    projectId,
    {
      type: 'state',
      artefactSnapshot: snapshot
    },
    { extraFiles: [PROJECT_FILES.artefact] }
  );
}
