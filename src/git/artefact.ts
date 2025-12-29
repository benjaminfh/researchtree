// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { promises as fs } from 'fs';
import { simpleGit } from 'simple-git';
import { INITIAL_BRANCH, PROJECT_FILES } from './constants';
import { appendNode } from './nodes';
import { assertProjectExists, forceCheckoutRef, getCurrentBranchName, getProjectFilePath, getProjectPath } from './utils';

export async function getArtefact(projectId: string): Promise<string> {
  await assertProjectExists(projectId);
  const artefactPath = getProjectFilePath(projectId, 'artefact');
  try {
    return await fs.readFile(artefactPath, 'utf-8');
  } catch {
    return '';
  }
}

export async function getArtefactFromRef(projectId: string, ref?: string): Promise<string> {
  await assertProjectExists(projectId);
  if (!ref || ref === 'WORKING_TREE') {
    return getArtefact(projectId);
  }
  const git = simpleGit(getProjectPath(projectId));
  try {
    return await git.show([`${ref}:${PROJECT_FILES.artefact}`]);
  } catch {
    return '';
  }
}

export async function updateArtefact(projectId: string, content: string, ref?: string): Promise<void> {
  await assertProjectExists(projectId);
  const git = simpleGit(getProjectPath(projectId));
  const currentBranch = await getCurrentBranchName(projectId);
  const targetBranch = ref ?? currentBranch ?? INITIAL_BRANCH;
  await forceCheckoutRef(projectId, targetBranch);

  try {
    const artefactPath = getProjectFilePath(projectId, 'artefact');
    await fs.writeFile(artefactPath, content ?? '');

    const snapshot = (await git.raw(['hash-object', '-w', PROJECT_FILES.artefact])).trim();

    await appendNode(
      projectId,
      {
        type: 'state',
        artefactSnapshot: snapshot
      },
      { extraFiles: [PROJECT_FILES.artefact], ref: targetBranch }
    );
  } finally {
    if (currentBranch !== targetBranch) {
      await forceCheckoutRef(projectId, currentBranch);
    }
  }
}
