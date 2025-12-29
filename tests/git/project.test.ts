// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { deleteProject, getProject, initProject, listProjects } from '../../src/git';
import { setProjectsRoot } from '../../src/git/constants';
import { getProjectFilePath, getProjectPath } from '../../src/git/utils';
import {
  assertValidUUID,
  ensureTestProjectsRoot,
  generateTestProjectName,
  getCommitCount,
  clearAllTestProjects,
  getTestProjectsRoot
} from './test-utils';

const createdProjects: string[] = [];
const TEST_ROOT = getTestProjectsRoot('projects');

async function createProject(description?: string) {
  setProjectsRoot(TEST_ROOT);
  const name = generateTestProjectName();
  const project = await initProject(name, description);
  createdProjects.push(project.id);
  return project;
}

beforeAll(async () => {
  await clearAllTestProjects(TEST_ROOT);
  await ensureTestProjectsRoot(TEST_ROOT);
});

afterEach(async () => {
  while (createdProjects.length > 0) {
    const id = createdProjects.pop();
    if (!id) continue;
    await deleteProject(id).catch(() => undefined);
  }
});

afterAll(async () => {
  // keep projects root intact across runs
});

describe('Project operations', () => {
  it('initProject creates complete valid structure', async () => {
    const project = await createProject('Description');
    assertValidUUID(project.id);

    const projectPath = getProjectPath(project.id);
    expect(await fs.stat(projectPath)).toBeTruthy();
    expect(await fs.stat(path.join(projectPath, '.git'))).toBeTruthy();

    const nodes = await fs.readFile(getProjectFilePath(project.id, 'nodes'), 'utf-8');
    expect(nodes).toBe('');

    const artefact = await fs.readFile(getProjectFilePath(project.id, 'artefact'), 'utf-8');
    expect(artefact).toBe('');

    const stars = JSON.parse(await fs.readFile(getProjectFilePath(project.id, 'stars'), 'utf-8'));
    expect(stars).toEqual({ starredNodeIds: [] });

    expect(await fs.stat(getProjectFilePath(project.id, 'metadata'))).toBeTruthy();
    expect(await fs.stat(getProjectFilePath(project.id, 'readme'))).toBeTruthy();

    const commitCount = await getCommitCount(project.id);
    expect(commitCount).toBe(1);
  });

  it('initProject creates valid metadata with and without description', async () => {
    const projectA = await createProject('Has description');
    const projectB = await createProject();

    const metadataAPath = getProjectFilePath(projectA.id, 'metadata');
    const metadataBPath = getProjectFilePath(projectB.id, 'metadata');

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
    await clearAllTestProjects(TEST_ROOT);
    await ensureTestProjectsRoot(TEST_ROOT);
    setProjectsRoot(TEST_ROOT);
    const projects = await listProjects();
    expect(projects).toEqual([]);
  });

  it('listProjects returns all projects with correct metadata', async () => {
    const projectA = await createProject('one');
    const projectB = await createProject('two');
    const projectC = await createProject('three');

    setProjectsRoot(TEST_ROOT);
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
    setProjectsRoot(TEST_ROOT);
    const metadata = await getProject('non-existent-id');
    expect(metadata).toBeNull();
  });

  it('deleteProject removes project directory', async () => {
    const first = await createProject('one');
    const second = await createProject('two');

    await deleteProject(first.id);
    const firstPath = getProjectPath(first.id);
    await expect(fs.access(firstPath)).rejects.toBeDefined();

    const projects = await listProjects();
    expect(projects.map((p) => p.id)).not.toContain(first.id);
    expect(projects.map((p) => p.id)).toContain(second.id);
  });
});
