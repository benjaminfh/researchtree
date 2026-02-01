// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import useSWR, { type KeyedMutator } from 'swr';
import type { NodeRecord } from '@git/types';

const fetcher = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return res.json();
};

export interface ProjectData {
  nodes: NodeRecord[];
  artefact: string;
  artefactMeta: { artefact: string; lastUpdatedAt: number | null } | null;
  isLoading: boolean;
  error: Error | undefined;
  mutateHistory: KeyedMutator<{ nodes: NodeRecord[] }>;
  mutateArtefact: KeyedMutator<{ artefact: string; lastUpdatedAt: number | null }>;
}

interface UseProjectDataOptions {
  ref?: string;
  artefactRef?: string;
}

export function useProjectData(projectId: string, options?: UseProjectDataOptions): ProjectData {
  const ref = options?.ref?.trim();
  const artefactRef = options?.artefactRef?.trim();
  const historyKey = ref ? `/api/projects/${projectId}/history?ref=${encodeURIComponent(ref)}` : `/api/projects/${projectId}/history`;
  const artefactEffectiveRef = artefactRef ?? ref;
  const artefactKey = artefactEffectiveRef
    ? `/api/projects/${projectId}/artefact?ref=${encodeURIComponent(artefactEffectiveRef)}`
    : `/api/projects/${projectId}/artefact`;

  const {
    data: history,
    error: historyError,
    mutate: mutateHistory,
    isLoading: historyLoading
  } = useSWR<{ nodes: NodeRecord[] }>(historyKey, fetcher, { revalidateOnFocus: true });

  const {
    data: artefact,
    error: artefactError,
    mutate: mutateArtefact,
    isLoading: artefactLoading
  } = useSWR<{ artefact: string; lastUpdatedAt: number | null }>(artefactKey, fetcher);

  return {
    nodes: history?.nodes ?? [],
    artefact: artefact?.artefact ?? '',
    artefactMeta: artefact ?? null,
    isLoading: historyLoading || artefactLoading,
    error: historyError ?? artefactError,
    mutateHistory,
    mutateArtefact
  };
}
