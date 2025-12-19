import { getProject } from '@git/projects';
import { getStarredNodeIds, toggleStar } from '@git/stars';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { INITIAL_BRANCH } from '@git/constants';
import { z } from 'zod';
import { requireUser } from '@/src/server/auth';

interface RouteContext {
  params: { id: string };
}

const toggleStarSchema = z.object({
  nodeId: z.string().min(1)
});

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const starredNodeIds = await getStarredNodeIds(project.id);

    if (process.env.RT_PG_SHADOW_WRITE === 'true') {
      try {
        const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
        const { rtSyncStarsShadow } = await import('@/src/store/pg/stars');
        await rtCreateProjectShadow({ projectId: project.id, name: project.name, description: project.description });
        await rtSyncStarsShadow({ projectId: project.id, nodeIds: starredNodeIds });
      } catch (error) {
        console.error('[pg-shadow-write] Failed to sync stars', error);
      }
    }

    return Response.json({ starredNodeIds });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const body = await request.json().catch(() => null);
    const parsed = toggleStarSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    return await withProjectLockAndRefLock(project.id, INITIAL_BRANCH, async () => {
      const starredNodeIds = await toggleStar(project.id, parsed.data.nodeId);

      if (process.env.RT_PG_SHADOW_WRITE === 'true') {
        try {
          const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
          const { rtSyncStarsShadow } = await import('@/src/store/pg/stars');
          await rtCreateProjectShadow({ projectId: project.id, name: project.name, description: project.description });
          await rtSyncStarsShadow({ projectId: project.id, nodeIds: starredNodeIds });
        } catch (error) {
          console.error('[pg-shadow-write] Failed to toggle star', error);
        }
      }

      return Response.json({ starredNodeIds });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
