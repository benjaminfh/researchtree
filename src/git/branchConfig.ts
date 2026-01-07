// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { promises as fs } from 'fs';
import path from 'path';
import type { LLMProvider } from '@/src/shared/llmProvider';
import { getProjectPath, pathExists, readJsonFile } from './utils';

export interface BranchConfigRecord {
  provider: LLMProvider;
  model: string;
  previousResponseId?: string | null;
  isHidden?: boolean;
}

interface BranchConfigFile {
  version: 1;
  branches: Record<string, BranchConfigRecord>;
}

const BRANCH_CONFIG_FILENAME = 'rt-branch-config.json';

function getBranchConfigPath(projectId: string): string {
  return path.join(getProjectPath(projectId), '.git', BRANCH_CONFIG_FILENAME);
}

export async function readBranchConfigMap(projectId: string): Promise<Record<string, BranchConfigRecord>> {
  const filePath = getBranchConfigPath(projectId);
  if (!(await pathExists(filePath))) {
    return {};
  }
  try {
    const payload = await readJsonFile<BranchConfigFile>(filePath);
    if (!payload || payload.version !== 1 || typeof payload.branches !== 'object' || payload.branches == null) {
      return {};
    }
    return payload.branches ?? {};
  } catch {
    return {};
  }
}

export async function writeBranchConfigMap(projectId: string, map: Record<string, BranchConfigRecord>): Promise<void> {
  const filePath = getBranchConfigPath(projectId);
  const payload: BranchConfigFile = { version: 1, branches: map };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

export async function setBranchConfig(projectId: string, branchName: string, config: BranchConfigRecord): Promise<void> {
  const map = await readBranchConfigMap(projectId);
  map[branchName] = config;
  await writeBranchConfigMap(projectId, map);
}
