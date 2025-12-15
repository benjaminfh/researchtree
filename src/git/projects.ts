import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { INITIAL_BRANCH, PROJECT_FILES, PROJECTS_ROOT } from './constants';
import type { ProjectMetadata } from './types';
import {
  assertProjectExists,
  ensureProjectsRoot,
  getProjectFilePath,
  getProjectPath,
  pathExists,
  readJsonFile,
  writeJsonFile,
  ensureGitUserConfig
} from './utils';

export async function initProject(name: string, description?: string): Promise<ProjectMetadata> {
  if (!name) {
    throw new Error('Project name is required');
  }

  await ensureProjectsRoot();
  const id = uuidv4();
  const projectPath = getProjectPath(id);
  await fs.mkdir(projectPath, { recursive: true });

  const git = simpleGit(projectPath);
  await git.init();
  await git.checkoutLocalBranch(INITIAL_BRANCH);

  const metadata: ProjectMetadata = {
    id,
    name,
    description,
    createdAt: new Date().toISOString()
  };

  const nodesPath = getProjectFilePath(id, 'nodes');
  const artefactPath = getProjectFilePath(id, 'artefact');
  const readmePath = getProjectFilePath(id, 'readme');
  const metadataPath = getProjectFilePath(id, 'metadata');

  await fs.writeFile(nodesPath, '');
  await fs.writeFile(artefactPath, '');
  await writeJsonFile(metadataPath, metadata);

  const readme = [`# ${name}`, '', description ?? '', ''].join('\n');
  await fs.writeFile(readmePath, readme.trimEnd() + '\n');

  await ensureGitUserConfig(id);
  await git.add(Object.values(PROJECT_FILES));
  await git.commit('[init] Initialize project');

  return metadata;
}

export async function listProjects(): Promise<ProjectMetadata[]> {
  const rootExists = await pathExists(PROJECTS_ROOT);
  if (!rootExists) {
    return [];
  }

  const entries = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
  const projects: ProjectMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(PROJECTS_ROOT, entry.name, PROJECT_FILES.metadata);
    const metadata = await readFileIfExists<ProjectMetadata>(metaPath);
    if (metadata) {
      projects.push(metadata);
    }
  }
  return projects;
}

export async function getProject(projectId: string): Promise<ProjectMetadata | null> {
  try {
    await assertProjectExists(projectId);
  } catch {
    return null;
  }

  const metadataPath = getProjectFilePath(projectId, 'metadata');
  if (!(await pathExists(metadataPath))) {
    return null;
  }
  return readJsonFile<ProjectMetadata>(metadataPath);
}

export async function deleteProject(projectId: string): Promise<void> {
  await assertProjectExists(projectId);
  await fs.rm(getProjectPath(projectId), { recursive: true, force: true });
}

async function readFileIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
