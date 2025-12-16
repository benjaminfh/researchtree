import { getProject } from '@git/projects';
import { getNodes } from '@git/nodes';
import { readNodesFromRef } from '@git/utils';
import { handleRouteError, notFound } from '@/src/server/http';

interface RouteContext {
  params: { id: string };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const refParam = searchParams.get('ref');
    const nodes = refParam ? await readNodesFromRef(project.id, refParam) : await getNodes(project.id);

    let result = nodes;
    if (limitParam) {
      const limit = Number.parseInt(limitParam, 10);
      if (!Number.isNaN(limit) && limit > 0) {
        result = nodes.slice(-limit);
      }
    }

    return Response.json({ nodes: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
