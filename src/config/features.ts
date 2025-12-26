export const features = {
  uiEditAnyMessage: process.env.NEXT_PUBLIC_RT_UI_EDIT_ANY_MESSAGE === 'true',
  uiAttachments: process.env.NEXT_PUBLIC_RT_UI_ATTACHMENTS === 'true',
  graphEdgeStyle: (process.env.NEXT_PUBLIC_RT_GRAPH_EDGE_STYLE ?? 'spline').toLowerCase() === 'orthogonal'
    ? 'orthogonal'
    : 'spline'
} as const;
