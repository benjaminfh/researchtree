import { handleRouteError, notFound } from '@/src/server/http';
import { INITIAL_BRANCH } from '@git/constants';
import { requireUser } from '@/src/server/auth';
import type { NodeRecord } from '@git/types';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    await requireProjectAccess({ id: params.id });
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const refParam = searchParams.get('ref');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const effectiveLimit = Number.isFinite(limit as number) && (limit as number) > 0 ? (limit as number) : undefined;

    if (store.mode === 'pg') {
      const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
      const { rtGetHistoryShadowV1 } = await import('@/src/store/pg/reads');
      const refName =
        refParam?.trim() || (await rtGetCurrentRefShadowV1({ projectId: params.id, defaultRefName: INITIAL_BRANCH })).refName;
      const rows = await rtGetHistoryShadowV1({ projectId: params.id, refName, limit: effectiveLimit });
      const pgNodes = rows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
      const nonStateNodes = pgNodes.filter((node) => node.type !== 'state');
      return Response.json({ nodes: nonStateNodes });
    }

    const { getProject } = await import('@git/projects');
    const { readNodesFromRef } = await import('@git/utils');

    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const refName = refParam?.trim() || INITIAL_BRANCH;
    const nodes = await readNodesFromRef(project.id, refName);

    // Canvas saves create `state` nodes in the git backend; those are not user-facing chat turns.
    // Keep them out of the history API response to avoid flooding the chat UI.
    const nonStateNodes = nodes.filter((node) => node.type !== 'state');

    let result = nonStateNodes;
    if (limitParam) {
      if (!Number.isNaN(limit) && limit > 0) {
        result = nonStateNodes.slice(-limit);
      }
    }

    return Response.json({ nodes: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
