// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { INITIAL_BRANCH, PROJECT_FILES, PROJECTS_ROOT } from './constants';
import type { ProjectMetadata } from './types';
import { getDefaultModelForProvider, resolveLLMProvider, resolveOpenAIProviderSelection, type LLMProvider } from '@/src/server/llm';
import {
  assertProjectExists,
  ensureProjectsRoot,
  getProjectFilePath,
  getProjectPath,
  pathExists,
  readJsonFile,
  writeJsonFile,
  ensureGitUserConfig,
  registerProjectRoot,
  unregisterProjectRoot,
  getCurrentBranchName
} from './utils';
import { setBranchConfig } from './branchConfig';

export async function initProject(
  name: string,
  description?: string,
  provider?: LLMProvider,
  systemPrompt?: string
): Promise<ProjectMetadata> {
  if (!name) {
    throw new Error('Project name is required');
  }

  const projectsRoot = PROJECTS_ROOT;
  await ensureProjectsRoot(projectsRoot);
  const id = uuidv4();
  registerProjectRoot(id, projectsRoot);
  const projectPath = getProjectPath(id);
  await fs.mkdir(projectPath, { recursive: true });

  const git = simpleGit(projectPath);
  await git.init();
  await git.checkoutLocalBranch(INITIAL_BRANCH);
  const requestedProvider = resolveOpenAIProviderSelection(provider);
  const resolvedProvider = resolveLLMProvider(requestedProvider);
  await setBranchConfig(id, INITIAL_BRANCH, {
    provider: resolvedProvider,
    model: getDefaultModelForProvider(resolvedProvider)
  });

  const metadata: ProjectMetadata = {
    id,
    name,
    description,
    createdAt: new Date().toISOString(),
    systemPrompt: systemPrompt?.trim() ? systemPrompt : undefined
  };

  const nodesPath = getProjectFilePath(id, 'nodes');
  const artefactPath = getProjectFilePath(id, 'artefact');
  const starsPath = getProjectFilePath(id, 'stars');
  const readmePath = getProjectFilePath(id, 'readme');
  const metadataPath = getProjectFilePath(id, 'metadata');

  await fs.writeFile(nodesPath, '');
  await fs.writeFile(artefactPath, '');
  await fs.writeFile(starsPath, JSON.stringify({ starredNodeIds: [] }, null, 2) + '\n');
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
    if (!metadata) {
      continue;
    }
    const branchName = await getCurrentBranchName(metadata.id).catch(() => undefined);
    projects.push({ ...metadata, branchName });
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
  const metadata = await readJsonFile<ProjectMetadata>(metadataPath);
  const branchName = await getCurrentBranchName(projectId).catch(() => undefined);
  return { ...metadata, branchName };
}

export async function getPinnedBranchName(projectId: string): Promise<string | null> {
  await assertProjectExists(projectId);
  const metadataPath = getProjectFilePath(projectId, 'metadata');
  if (!(await pathExists(metadataPath))) {
    return null;
  }
  const metadata = await readJsonFile<ProjectMetadata>(metadataPath);
  return metadata.pinnedBranchName ?? null;
}

export async function setPinnedBranchName(projectId: string, branchName: string | null): Promise<void> {
  await assertProjectExists(projectId);
  const metadataPath = getProjectFilePath(projectId, 'metadata');
  if (!(await pathExists(metadataPath))) {
    throw new Error('Project metadata not found');
  }
  const metadata = await readJsonFile<ProjectMetadata>(metadataPath);
  if (branchName) {
    metadata.pinnedBranchName = branchName;
  } else if ('pinnedBranchName' in metadata) {
    delete (metadata as ProjectMetadata & { pinnedBranchName?: string }).pinnedBranchName;
  }
  await writeJsonFile(metadataPath, metadata);
}

export async function deleteProject(projectId: string): Promise<void> {
  await assertProjectExists(projectId);
  await fs.rm(getProjectPath(projectId), { recursive: true, force: true });
  unregisterProjectRoot(projectId);
}

async function readFileIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
