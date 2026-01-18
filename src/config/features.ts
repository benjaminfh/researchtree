// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

export const features = {
  uiEditAnyMessage: process.env.NEXT_PUBLIC_RT_UI_EDIT_ANY_MESSAGE === 'true',
  uiAttachments: process.env.NEXT_PUBLIC_RT_UI_ATTACHMENTS === 'true',
  uiRailBranchCreator: process.env.NEXT_PUBLIC_RT_UI_RAIL_BRANCH_CREATOR === 'true',
  uiCollapsedBranchTwoNodes: process.env.NEXT_PUBLIC_RT_UI_COLLAPSED_BRANCH_TWO_NODES === 'true',
  uiShareMode: (() => {
    const raw = (process.env.NEXT_PUBLIC_RT_UI_SHARE_MODE ?? 'all').toLowerCase();
    if (raw === 'admins') return 'admins';
    if (raw === 'hidden') return 'hidden';
    return 'all';
  })(),
  graphEdgeStyle: (process.env.NEXT_PUBLIC_RT_GRAPH_EDGE_STYLE ?? 'spline').toLowerCase() === 'orthogonal'
    ? 'orthogonal'
    : 'spline'
} as const;
