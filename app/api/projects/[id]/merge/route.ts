import { mergeBranch } from '@git/branches';
import { getProject } from '@git/projects';
import { badRequest, handleRouteError, notFound } from '@/src/server/http';
import { mergeRequestSchema } from '@/src/server/schemas';
import { withProjectLockAndRefLock } from '@/src/server/locks';
import { getCurrentBranchName } from '@git/utils';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireProjectAccess } from '@/src/server/authz';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const shouldUsePrefs = getStoreConfig().usePgPrefs;
  if (!shouldUsePrefs) {
    return getCurrentBranchName(projectId);
  }
  try {
    const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    await rtCreateProjectShadow({ projectId, name: 'Untitled' });
    const { refName } = await rtGetCurrentRefShadowV1({ projectId, defaultRefName: 'main' });
    return refName;
  } catch {
    return getCurrentBranchName(projectId);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const store = getStoreConfig();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    await requireProjectAccess(project);

    const body = await request.json().catch(() => null);
    const parsed = mergeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const { sourceBranch, mergeSummary, targetBranch, sourceAssistantNodeId } = parsed.data;
    const resolvedTargetBranch = targetBranch ?? (await getPreferredBranch(project.id));
    return await withProjectLockAndRefLock(project.id, resolvedTargetBranch, async () => {
      try {
        const mergeNode = await mergeBranch(project.id, sourceBranch, mergeSummary, {
          targetBranch: resolvedTargetBranch,
          sourceAssistantNodeId: sourceAssistantNodeId?.trim() || undefined
        });

        if (store.shadowWriteToPg) {
          try {
            const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
            const { rtMergeOursShadowV1 } = await import('@/src/store/pg/merge');
            await rtCreateProjectShadow({
              projectId: project.id,
              name: project.name ?? 'Untitled',
              description: project.description
            });
            await rtMergeOursShadowV1({
              projectId: project.id,
              targetRefName: resolvedTargetBranch,
              sourceRefName: sourceBranch,
              mergeNodeId: mergeNode.id,
              mergeNodeJson: mergeNode,
              commitMessage: 'merge'
            });
          } catch (error) {
            console.error('[pg-shadow-write] Failed to shadow merge', error);
          }
        }

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
