import { getProject } from '@git/projects';
import { readNodesFromRef } from '@git/utils';
import { handleRouteError, notFound } from '@/src/server/http';
import { INITIAL_BRANCH } from '@git/constants';
import { requireUser } from '@/src/server/auth';
import type { NodeRecord } from '@git/types';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const shouldUsePrefs =
    process.env.RT_PG_PREFS === 'true' || process.env.RT_PG_READ === 'true' || process.env.RT_PG_SHADOW_WRITE === 'true';
  if (!shouldUsePrefs) return INITIAL_BRANCH;
  try {
    const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    await rtCreateProjectShadow({ projectId, name: 'Untitled' });
    const { refName } = await rtGetCurrentRefShadowV1({ projectId, defaultRefName: INITIAL_BRANCH });
    return refName;
  } catch {
    return INITIAL_BRANCH;
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const refParam = searchParams.get('ref');
    const refName = refParam?.trim() || (await getPreferredBranch(project.id));

    if (process.env.RT_PG_READ === 'true') {
      const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
      const effectiveLimit = Number.isFinite(limit as number) && (limit as number) > 0 ? (limit as number) : undefined;

      try {
        const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
        const { rtGetHistoryShadowV1 } = await import('@/src/store/pg/reads');
        await rtCreateProjectShadow({ projectId: project.id, name: project.name, description: project.description });
        const rows = await rtGetHistoryShadowV1({ projectId: project.id, refName, limit: effectiveLimit });
        const pgNodes = rows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
        const nonStateNodes = pgNodes.filter((node) => node.type !== 'state');
        return Response.json({ nodes: nonStateNodes });
      } catch (error) {
        console.error('[pg-read] Failed to read history, falling back to git', error);
      }
    }

    const nodes = await readNodesFromRef(project.id, refName);

    // Canvas saves create `state` nodes in the git backend; those are not user-facing chat turns.
    // Keep them out of the history API response to avoid flooding the chat UI.
    const nonStateNodes = nodes.filter((node) => node.type !== 'state');

    let result = nonStateNodes;
    if (limitParam) {
      const limit = Number.parseInt(limitParam, 10);
      if (!Number.isNaN(limit) && limit > 0) {
        result = nonStateNodes.slice(-limit);
      }
    }

    return Response.json({ nodes: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
