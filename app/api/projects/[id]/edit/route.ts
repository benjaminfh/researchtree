import { appendNode } from '@git/nodes';
import { createBranch } from '@git/branches';
import { getProject } from '@git/projects';
import { getCurrentBranchName, getCommitHashForNode, readNodesFromRef } from '@git/utils';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { editMessageSchema } from '@/src/server/schemas';
import { acquireProjectRefLock, withProjectLock } from '@/src/server/locks';
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
    const parsed = editMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { content, branchName, fromRef, nodeId } = parsed.data;
    const currentBranch = await getCurrentBranchName(project.id);
    const targetBranch = branchName?.trim() || `edit-${Date.now()}`;
    const sourceRef = fromRef?.trim() || currentBranch;

    return await withProjectLock(project.id, async () => {
      const releaseRefLock = await acquireProjectRefLock(project.id, sourceRef);
      try {
      const sourceNodes = await readNodesFromRef(project.id, sourceRef);
      const targetNode = sourceNodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        throw badRequest(`Node ${nodeId} not found on ref ${sourceRef}`);
      }
      if (targetNode.type !== 'message') {
        throw badRequest('Only message nodes can be edited');
      }

      try {
        const commitHash = await getCommitHashForNode(project.id, sourceRef, nodeId, { parent: true });
        await createBranch(project.id, targetBranch, commitHash);
      } catch (err) {
        const message = (err as Error)?.message ?? 'Failed to create edit branch';
        throw badRequest(message);
      }

      if (process.env.RT_PG_SHADOW_WRITE === 'true') {
        try {
          const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
          const { rtCreateRefFromNodeParentShadowV1 } = await import('@/src/store/pg/branches');
          await rtCreateProjectShadow({
            projectId: project.id,
            name: project.name ?? 'Untitled',
            description: project.description
          });
          await rtCreateRefFromNodeParentShadowV1({
            projectId: project.id,
            sourceRefName: sourceRef,
            newRefName: targetBranch,
            nodeId
          });
        } catch (error) {
          console.error('[pg-shadow-write] Failed to create edit branch', error);
        }
      }

      const node = await appendNode(
        project.id,
        {
          type: 'message',
          role: targetNode.role,
          content
        },
        { ref: targetBranch }
      );

      if (process.env.RT_PG_SHADOW_WRITE === 'true') {
        try {
          const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
          const { rtAppendNodeToRefShadowV1 } = await import('@/src/store/pg/nodes');
          await rtCreateProjectShadow({
            projectId: project.id,
            name: project.name ?? 'Untitled',
            description: project.description
          });
          await rtAppendNodeToRefShadowV1({
            projectId: project.id,
            refName: targetBranch,
            kind: node.type,
            role: node.role,
            contentJson: node,
            nodeId: node.id,
            commitMessage: 'edit_message',
            attachDraft: false
          });
        } catch (error) {
          console.error('[pg-shadow-write] Failed to append edited node', error);
        }
      }

      return Response.json({ branchName: targetBranch, node }, { status: 201 });
      } finally {
        releaseRefLock();
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
