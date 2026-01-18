// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getProjectPath, pathExists, readJsonFile } from './utils';

interface BranchIdFile {
  version: 1;
  branches: Record<string, string>;
}

const BRANCH_IDS_FILENAME = 'rt-branch-ids.json';

function getBranchIdsPath(projectId: string): string {
  return path.join(getProjectPath(projectId), '.git', BRANCH_IDS_FILENAME);
}

export async function readBranchIdMap(projectId: string): Promise<Record<string, string>> {
  const filePath = getBranchIdsPath(projectId);
  if (!(await pathExists(filePath))) {
    return {};
  }
  try {
    const payload = await readJsonFile<BranchIdFile>(filePath);
    if (!payload || payload.version !== 1 || typeof payload.branches !== 'object' || payload.branches == null) {
      return {};
    }
    return payload.branches ?? {};
  } catch {
    return {};
  }
}

async function writeBranchIdMap(projectId: string, map: Record<string, string>): Promise<void> {
  const filePath = getBranchIdsPath(projectId);
  const payload: BranchIdFile = { version: 1, branches: map };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

export async function ensureBranchId(projectId: string, branchName: string): Promise<string> {
  const map = await readBranchIdMap(projectId);
  if (map[branchName]) return map[branchName]!;
  const id = uuidv4();
  map[branchName] = id;
  await writeBranchIdMap(projectId, map);
  return id;
}

export async function ensureBranchIds(projectId: string, branchNames: string[]): Promise<Record<string, string>> {
  const map = await readBranchIdMap(projectId);
  let updated = false;
  for (const name of branchNames) {
    if (!map[name]) {
      map[name] = uuidv4();
      updated = true;
    }
  }
  if (updated) {
    await writeBranchIdMap(projectId, map);
  }
  return map;
}

export async function renameBranchId(projectId: string, fromBranch: string, toBranch: string): Promise<string> {
  const map = await readBranchIdMap(projectId);
  const existing = map[fromBranch];
  const id = existing ?? uuidv4();
  if (existing) {
    delete map[fromBranch];
  }
  map[toBranch] = id;
  await writeBranchIdMap(projectId, map);
  return id;
}
