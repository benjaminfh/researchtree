import { appendNode } from '@git/nodes';
import { createBranch } from '@git/branches';
import { getProject } from '@git/projects';
import { getCurrentBranchName, getCommitHashForNode } from '@git/utils';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { editMessageSchema } from '@/src/server/schemas';
import { withProjectLock } from '@/src/server/locks';

interface RouteContext {
  params: { id: string };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }

    const body = await request.json().catch(() => null);
    const parsed = editMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { content, branchName, fromRef, nodeId } = parsed.data;
    const currentBranch = await getCurrentBranchName(project.id);
    const targetBranch = branchName?.trim() || `edit-${Date.now()}`;
    const sourceRef = fromRef?.trim() || currentBranch;

    return await withProjectLock(project.id, async () => {
      try {
        const commitHash = await getCommitHashForNode(project.id, sourceRef, nodeId, { parent: true });
        await createBranch(project.id, targetBranch, commitHash);
      } catch (err) {
        const message = (err as Error)?.message ?? 'Failed to create edit branch';
        throw badRequest(message);
      }

      const node = await appendNode(
        project.id,
        {
          type: 'message',
          role: 'user',
          content
        },
        { ref: targetBranch }
      );

      return Response.json({ branchName: targetBranch, node }, { status: 201 });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
