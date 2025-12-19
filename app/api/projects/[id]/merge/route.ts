import { mergeBranch } from '@git/branches';
import { getProject } from '@git/projects';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { mergeRequestSchema } from '@/src/server/schemas';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { getCurrentBranchName } from '@git/utils';
import { requireUser } from '@/src/server/auth';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    const body = await request.json().catch(() => null);
    const parsed = mergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { sourceBranch, mergeSummary, targetBranch, sourceAssistantNodeId } = parsed.data;
    const resolvedTargetBranch = targetBranch ?? (await getCurrentBranchName(project.id));
    return await withProjectLockAndRefLock(project.id, resolvedTargetBranch, async () => {
      try {
        const mergeNode = await mergeBranch(project.id, sourceBranch, mergeSummary, {
          targetBranch: resolvedTargetBranch,
          sourceAssistantNodeId: sourceAssistantNodeId?.trim() || undefined
        });
        return Response.json({ mergeNode });
      } catch (err) {
        const message = (err as Error)?.message ?? 'Merge failed';
        if (message.toLowerCase().includes('does not exist')) {
          throw badRequest(message);
        }
        if (message.toLowerCase().includes('cannot merge')) {
          throw badRequest(message);
        }
        throw err;
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
