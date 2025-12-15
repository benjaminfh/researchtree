import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBranch, deleteProject, getArtefact, initProject, switchBranch, updateArtefact } from '../../src/git';
import { PROJECTS_ROOT, PROJECT_FILES } from '../../src/git/constants';
import { generateTestProjectName, readProjectFile } from './test-utils';
import path from 'path';
import { promises as fs } from 'fs';

let projectId: string;

beforeEach(async () => {
  const project = await initProject(generateTestProjectName());
  projectId = project.id;
});

afterEach(async () => {
  if (projectId) {
    await deleteProject(projectId).catch(() => undefined);
  }
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
    await updateArtefact(projectId, 'Artefact content');
    const filePath = path.join(PROJECTS_ROOT, projectId, PROJECT_FILES.artefact);
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

  it('updateArtefact throws error if not on trunk', async () => {
    await createBranch(projectId, 'feature');
    await switchBranch(projectId, 'feature');
    await expect(updateArtefact(projectId, 'Should fail')).rejects.toThrow(/trunk/i);
  });

  it('updateArtefact works after switching back to trunk', async () => {
    await createBranch(projectId, 'feature');
    await switchBranch(projectId, 'feature');
    await expect(updateArtefact(projectId, 'Should fail')).rejects.toThrow();
    await switchBranch(projectId, 'main');
    await expect(updateArtefact(projectId, 'Content')).resolves.not.toThrow();
  });

  it('getArtefact on branch shows trunk content read-only', async () => {
    await updateArtefact(projectId, 'Main artefact');
    await createBranch(projectId, 'feature');
    await switchBranch(projectId, 'feature');
    expect(await getArtefact(projectId)).toBe('Main artefact');
    await switchBranch(projectId, 'main');
    await updateArtefact(projectId, 'Updated main');
    await switchBranch(projectId, 'feature');
    expect(await getArtefact(projectId)).toBe('Main artefact');
  });
});
