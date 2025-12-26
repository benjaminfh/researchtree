import { getStoreConfig } from '@/src/server/storeConfig';
import { resolveOpenAIProviderSelection, getDefaultModelForProvider } from '@/src/server/llm';
import { readBranchConfigMap, writeBranchConfigMap } from '@/src/git/branchConfig';

export async function getPreviousResponseId(projectId: string, refName: string): Promise<string | null> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtGetRefPreviousResponseIdV1 } = await import('@/src/store/pg/refs');
    return rtGetRefPreviousResponseIdV1({ projectId, refName });
  }

  const map = await readBranchConfigMap(projectId);
  return map[refName]?.previousResponseId ?? null;
}

export async function setPreviousResponseId(projectId: string, refName: string, responseId: string | null): Promise<void> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtSetRefPreviousResponseIdV1 } = await import('@/src/store/pg/refs');
    await rtSetRefPreviousResponseIdV1({ projectId, refName, previousResponseId: responseId ?? null });
    return;
  }

  const map = await readBranchConfigMap(projectId);
  const existing = map[refName];
  if (existing) {
    map[refName] = { ...existing, previousResponseId: responseId ?? null };
  } else {
    const provider = resolveOpenAIProviderSelection();
    map[refName] = {
      provider,
      model: getDefaultModelForProvider(provider),
      previousResponseId: responseId ?? null
    };
  }
  await writeBranchConfigMap(projectId, map);
}
