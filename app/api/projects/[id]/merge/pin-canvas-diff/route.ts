import { appendNodeToRefNoCheckout } from '@git/nodes';
import { getProject } from '@git/projects';
import { getCurrentBranchName, readNodesFromRef } from '@git/utils';
import { withProjectRefLock } from '@/src/server/locks';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { pinCanvasDiffSchema } from '@/src/server/schemas';
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
    const parsed = pinCanvasDiffSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { mergeNodeId, targetBranch } = parsed.data;
    const resolvedTargetBranch = targetBranch ?? (await getCurrentBranchName(project.id));

    return await withProjectRefLock(project.id, resolvedTargetBranch, async () => {
      const nodes = await readNodesFromRef(project.id, resolvedTargetBranch);
      const mergeNode = nodes.find((node) => node.type === 'merge' && node.id === mergeNodeId);
      if (!mergeNode || mergeNode.type !== 'merge') {
        throw badRequest('Merge node not found on target branch');
      }
      if (!mergeNode.canvasDiff?.trim()) {
        throw badRequest('Merge node has no canvas diff');
      }

      const existing = nodes.find(
        (node) => node.type === 'message' && node.role === 'assistant' && node.pinnedFromMergeId === mergeNodeId
      );
      if (existing && existing.type === 'message') {
        return Response.json({ pinnedNode: existing, alreadyPinned: true });
      }

      const pinnedNode = await appendNodeToRefNoCheckout(project.id, resolvedTargetBranch, {
        type: 'message',
        role: 'assistant',
        content: mergeNode.canvasDiff,
        pinnedFromMergeId: mergeNodeId
      });

      return Response.json({ pinnedNode, alreadyPinned: false });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
