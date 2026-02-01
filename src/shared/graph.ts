// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export interface GraphNode {
  id: string;
  parents: string[];
  originBranchId: string;
  laneBranchId: string;
  isOnActiveBranch: boolean;
  label: string;
  icon?: 'assistant' | 'user' | 'merge';
  hiddenCountByParent?: Record<string, number>;
}

export interface GraphViews {
  all: GraphNode[];
  collapsed: GraphNode[];
}
