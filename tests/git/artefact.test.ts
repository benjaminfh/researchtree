// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createBranch, deleteProject, getArtefact, getArtefactFromRef, initProject, switchBranch, updateArtefact } from '../../src/git';
import { setProjectsRoot } from '../../src/git/constants';
import { getProjectFilePath } from '../../src/git/utils';
import {
  ensureTestProjectsRoot,
  generateTestProjectName,
  readProjectFile,
  clearAllTestProjects,
  getTestProjectsRoot
} from './test-utils';
import { promises as fs } from 'fs';

let projectId: string;
const TEST_ROOT = getTestProjectsRoot('artefact');

beforeAll(async () => {
  await clearAllTestProjects(TEST_ROOT);
  await ensureTestProjectsRoot(TEST_ROOT);
});

beforeEach(async () => {
  setProjectsRoot(TEST_ROOT);
  const project = await initProject(generateTestProjectName());
  projectId = project.id;
});

afterEach(async () => {
  if (projectId) {
    await deleteProject(projectId).catch(() => undefined);
  }
});

afterAll(async () => {
  // keep projects root intact
});

describe('Artefact operations', () => {
  it('getArtefact returns empty string for new project', async () => {
    const artefact = await getArtefact(projectId);
    expect(artefact).toBe('');
  });

  it('getArtefact returns current content', async () => {
    await updateArtefact(projectId, 'Version 1');
    expect(await getArtefact(projectId)).toBe('Version 1');
    await updateArtefact(projectId, 'Version 2');
    expect(await getArtefact(projectId)).toBe('Version 2');
  });

  it('updateArtefact updates file and creates state node on trunk', async () => {
    await updateArtefact(projectId, 'Artefact content', 'main');
    const filePath = getProjectFilePath(projectId, 'artefact');
    const artefactContent = await fs.readFile(filePath, 'utf-8');
    expect(artefactContent).toBe('Artefact content');

    const nodesContent = await readProjectFile(projectId, 'nodes');
    const lines = nodesContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines[lines.length - 1]).toContain('"type":"state"');

    const lastNode = JSON.parse(lines[lines.length - 1]);
    expect(lastNode.artefactSnapshot).toMatch(/^[0-9a-f]{40}$/i);
  });

  it('updateArtefact defaults to the currently checked-out branch', async () => {
    await createBranch(projectId, 'feature');
    await switchBranch(projectId, 'feature');
    await expect(updateArtefact(projectId, 'Content')).resolves.not.toThrow();
    expect(await getArtefact(projectId)).toBe('Content');
    await switchBranch(projectId, 'main');
    expect(await getArtefact(projectId)).toBe('');
  });

  it('updateArtefact can target a specific ref', async () => {
    await createBranch(projectId, 'feature');
    await expect(updateArtefact(projectId, 'Branch canvas', 'feature')).resolves.not.toThrow();
    expect(await getArtefactFromRef(projectId, 'feature')).toBe('Branch canvas');
    expect(await getArtefactFromRef(projectId, 'main')).toBe('');
  });

  it('branch canvas snapshots do not follow trunk after divergence', async () => {
    await updateArtefact(projectId, 'Main artefact', 'main');
    await createBranch(projectId, 'feature');
    await switchBranch(projectId, 'feature');
    expect(await getArtefact(projectId)).toBe('Main artefact');
    await switchBranch(projectId, 'main');
    await updateArtefact(projectId, 'Updated main', 'main');
    await switchBranch(projectId, 'feature');
    expect(await getArtefact(projectId)).toBe('Main artefact');
  });
});
