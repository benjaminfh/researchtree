// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { badRequest } from '@/src/server/http';

export async function resolveRefByName(projectId: string, refName: string): Promise<{ id: string; name: string }> {
  const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
  const branches = await rtListRefsShadowV2({ projectId });
  const match = branches.find((branch) => branch.name === refName);
  if (!match?.id) {
    throw badRequest(`Branch ${refName} does not exist`);
  }
  return { id: match.id, name: match.name };
}

export async function resolveCurrentRef(projectId: string, defaultRefName = 'main'): Promise<{ id: string; name: string }> {
  const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
  const current = await rtGetCurrentRefShadowV2({ projectId, defaultRefName });
  if (current.refId) {
    return { id: current.refId, name: current.refName };
  }
  if (!current.refName) {
    throw badRequest('Current branch not found');
  }
  return resolveRefByName(projectId, current.refName);
}
