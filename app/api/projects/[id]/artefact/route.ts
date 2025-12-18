import { getProject } from '@git/projects';
import { getArtefactFromRef, updateArtefact } from '@git/artefact';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { updateArtefactSchema } from '@/src/server/schemas';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { readNodesFromRef } from '@git/utils';
import { INITIAL_BRANCH } from '@git/constants';

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
    const ref = searchParams.get('ref')?.trim() || null;
    const [artefact, nodes] = await Promise.all([
      ref ? getArtefactFromRef(project.id, ref) : getArtefactFromRef(project.id, INITIAL_BRANCH),
      ref ? readNodesFromRef(project.id, ref) : readNodesFromRef(project.id, INITIAL_BRANCH)
    ]);
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

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    const body = await request.json().catch(() => null);
    const parsed = updateArtefactSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref')?.trim() || INITIAL_BRANCH;

    return await withProjectLockAndRefLock(project.id, ref, async () => {
      try {
        await updateArtefact(project.id, parsed.data.content, ref);
      } catch (err) {
        const message = (err as Error)?.message ?? 'Failed to update artefact';
        throw badRequest(message);
      }

      const [artefact, nodes] = await Promise.all([getArtefactFromRef(project.id, ref), readNodesFromRef(project.id, ref)]);
      const lastState = [...nodes].reverse().find((node) => node.type === 'state');

      return Response.json(
        {
          artefact,
          lastStateNodeId: lastState?.id ?? null,
          lastUpdatedAt: lastState?.timestamp ?? null
        },
        { status: 200 }
      );
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return PUT(request, context);
}
