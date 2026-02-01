// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getStoreConfig } from '@/src/server/storeConfig';
import { resolveOpenAIProviderSelection, getDefaultModelForProvider } from '@/src/server/llm';
import { readBranchConfigMap, writeBranchConfigMap } from '@/src/git/branchConfig';

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
  return map[ref.name]?.previousResponseId ?? null;
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
  const existing = map[ref.name];
  if (existing) {
    map[ref.name] = { ...existing, previousResponseId: responseId ?? null };
  } else {
    const provider = resolveOpenAIProviderSelection();
    map[ref.name] = {
      provider,
      model: getDefaultModelForProvider(provider),
      previousResponseId: responseId ?? null
    };
  }
  await writeBranchConfigMap(projectId, map);
}
