import { getProject } from '@git/projects';
import { getArtefact } from '@git/artefact';
import { getNodes } from '@git/nodes';
import { handleRouteError, notFound } from '@/src/server/http';

interface RouteContext {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    const [artefact, nodes] = await Promise.all([getArtefact(project.id), getNodes(project.id)]);
    const lastState = [...nodes].reverse().find((node) => node.type === 'state');

    return Response.json({
      artefact,
      lastStateNodeId: lastState?.id ?? null,
      lastUpdatedAt: lastState?.timestamp ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
