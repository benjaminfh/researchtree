import { getProject } from '@git/projects';
import { getStarredNodeIds, toggleStar } from '@git/stars';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { withProjectLock } from '@/src/server/locks';
import { z } from 'zod';

interface RouteContext {
  params: { id: string };
}

const toggleStarSchema = z.object({
  nodeId: z.string().min(1)
});

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const starredNodeIds = await getStarredNodeIds(project.id);
    return Response.json({ starredNodeIds });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const body = await request.json().catch(() => null);
    const parsed = toggleStarSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    return await withProjectLock(project.id, async () => {
      const starredNodeIds = await toggleStar(project.id, parsed.data.nodeId);
      return Response.json({ starredNodeIds });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

