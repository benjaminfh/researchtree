// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

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
