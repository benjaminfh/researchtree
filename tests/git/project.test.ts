import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deleteProject, getProject, initProject, listProjects } from '../../src/git';
import { PROJECTS_ROOT, PROJECT_FILES } from '../../src/git/constants';
import { assertValidUUID, cleanupTestProjects, generateTestProjectName, getCommitCount } from './test-utils';

const createdProjects: string[] = [];

async function createProject(description?: string) {
  const name = generateTestProjectName();
  const project = await initProject(name, description);
  createdProjects.push(project.id);
  return project;
}

beforeEach(async () => {
  await cleanupTestProjects();
});

afterEach(async () => {
  while (createdProjects.length > 0) {
    const id = createdProjects.pop();
    if (!id) continue;
    await deleteProject(id).catch(() => undefined);
  }
  await cleanupTestProjects();
});

describe('Project operations', () => {
  it('initProject creates complete valid structure', async () => {
    const project = await initProject(generateTestProjectName(), 'Description');
    createdProjects.push(project.id);
    assertValidUUID(project.id);

    const projectPath = path.join(PROJECTS_ROOT, project.id);
    expect(await fs.stat(projectPath)).toBeTruthy();
    expect(await fs.stat(path.join(projectPath, '.git'))).toBeTruthy();

    const nodes = await fs.readFile(path.join(projectPath, PROJECT_FILES.nodes), 'utf-8');
    expect(nodes).toBe('');

    const artefact = await fs.readFile(path.join(projectPath, PROJECT_FILES.artefact), 'utf-8');
    expect(artefact).toBe('');

    expect(await fs.stat(path.join(projectPath, PROJECT_FILES.metadata))).toBeTruthy();
    expect(await fs.stat(path.join(projectPath, PROJECT_FILES.readme))).toBeTruthy();

    const commitCount = await getCommitCount(project.id);
    expect(commitCount).toBe(1);
  });

  it('initProject creates valid metadata with and without description', async () => {
    const projectA = await createProject('Has description');
    const projectB = await createProject();

    const metadataAPath = path.join(PROJECTS_ROOT, projectA.id, PROJECT_FILES.metadata);
    const metadataBPath = path.join(PROJECTS_ROOT, projectB.id, PROJECT_FILES.metadata);

    const metaA = JSON.parse(await fs.readFile(metadataAPath, 'utf-8'));
    const metaB = JSON.parse(await fs.readFile(metadataBPath, 'utf-8'));

    assertValidUUID(metaA.id);
    assertValidUUID(metaB.id);
    expect(metaA.name).toBe(projectA.name);
    expect(metaA.description).toBe('Has description');
    expect(typeof metaA.createdAt).toBe('string');

    expect(metaB.name).toBe(projectB.name);
    expect(metaB.description).toBeUndefined();
  });

  it('listProjects returns empty array when no projects exist', async () => {
    await cleanupTestProjects();
    const projects = await listProjects();
    expect(projects).toEqual([]);
  });

  it('listProjects returns all projects with correct metadata', async () => {
    const projectA = await createProject('one');
    const projectB = await createProject('two');
    const projectC = await createProject('three');

    const projects = await listProjects();
    const ids = projects.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([projectA.id, projectB.id, projectC.id]));

    for (const project of projects) {
      assertValidUUID(project.id);
      expect(typeof project.name).toBe('string');
      expect(typeof project.createdAt).toBe('string');
    }
  });

  it('getProject returns metadata for existing project', async () => {
    const project = await createProject('meta');
    const metadata = await getProject(project.id);
    expect(metadata).not.toBeNull();
    expect(metadata?.id).toBe(project.id);
    expect(metadata?.name).toBe(project.name);
  });

  it('getProject returns null for non-existent project', async () => {
    const metadata = await getProject('non-existent-id');
    expect(metadata).toBeNull();
  });

  it('deleteProject removes project directory', async () => {
    const first = await createProject('one');
    const second = await createProject('two');

    await deleteProject(first.id);
    const firstPath = path.join(PROJECTS_ROOT, first.id);
    await expect(fs.access(firstPath)).rejects.toBeDefined();

    const projects = await listProjects();
    expect(projects.map((p) => p.id)).not.toContain(first.id);
    expect(projects.map((p) => p.id)).toContain(second.id);
  });
});
