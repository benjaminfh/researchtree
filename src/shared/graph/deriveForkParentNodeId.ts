// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { NodeRecord } from '@git/types';

export const deriveForkParentNodeId = (
  branchHistories: Record<string, NodeRecord[]>,
  questionBranchName: string
): string | null => {
  const history = branchHistories[questionBranchName] ?? [];
  for (const node of history) {
    if (node.createdOnBranch === questionBranchName && node.parent) {
      return node.parent;
    }
  }
  return null;
};
