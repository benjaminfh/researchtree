// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { getStoreConfig } from '@/src/server/storeConfig';
import { resolveOpenAIProviderSelection, getDefaultModelForProvider } from '@/src/server/llm';
import { readBranchConfigMap, writeBranchConfigMap } from '@/src/git/branchConfig';
import { ensureBranchId, getBranchNameByIdMap } from '@/src/git/branchIds';

export async function getPreviousResponseId(
  projectId: string,
  ref: { id?: string | null; name: string }
): Promise<string | null> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtGetRefPreviousResponseIdV2 } = await import('@/src/store/pg/refs');
    if (!ref.id) {
      return null;
    }
    return rtGetRefPreviousResponseIdV2({ projectId, refId: ref.id });
  }

  const map = await readBranchConfigMap(projectId);
  const nameById = await getBranchNameByIdMap(projectId);
  const resolvedName = ref.id ? nameById[ref.id] : ref.name;
  if (!resolvedName) return null;
  return map[resolvedName]?.previousResponseId ?? null;
}

export async function setPreviousResponseId(
  projectId: string,
  ref: { id?: string | null; name: string },
  responseId: string | null
): Promise<void> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtSetRefPreviousResponseIdV2 } = await import('@/src/store/pg/refs');
    if (!ref.id) {
      return;
    }
    await rtSetRefPreviousResponseIdV2({ projectId, refId: ref.id, previousResponseId: responseId ?? null });
    return;
  }

  const map = await readBranchConfigMap(projectId);
  const nameById = await getBranchNameByIdMap(projectId);
  const resolvedName = ref.id ? nameById[ref.id] : ref.name;
  if (!resolvedName) {
    return;
  }
  if (!ref.id) {
    await ensureBranchId(projectId, resolvedName);
  }
  const existing = map[resolvedName];
  if (existing) {
    map[resolvedName] = { ...existing, previousResponseId: responseId ?? null };
  } else {
    const provider = resolveOpenAIProviderSelection();
    map[resolvedName] = {
      provider,
      model: getDefaultModelForProvider(provider),
      previousResponseId: responseId ?? null
    };
  }
  await writeBranchConfigMap(projectId, map);
}
