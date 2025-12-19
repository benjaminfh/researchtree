import { createBranch, listBranches, switchBranch } from '@git/branches';
import { getProject } from '@git/projects';
import { handleRouteError, notFound, badRequest } from '@/src/server/http';
import { createBranchSchema, switchBranchSchema } from '@/src/server/schemas';
import { getCurrentBranchName } from '@git/utils';
import { withProjectLock } from '@/src/server/locks';
import { requireUser } from '@/src/server/auth';

interface RouteContext {
  params: { id: string };
}

async function getPreferredBranch(projectId: string): Promise<string> {
  const shouldUsePrefs =
    process.env.RT_PG_PREFS === 'true' || process.env.RT_PG_READ === 'true' || process.env.RT_PG_SHADOW_WRITE === 'true';
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

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const branches = await listBranches(project.id);
    const currentBranch = await getPreferredBranch(project.id);
    return Response.json({ branches, currentBranch });
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
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    return await withProjectLock(project.id, async () => {
      await createBranch(project.id, parsed.data.name, parsed.data.fromRef);
      const branches = await listBranches(project.id);
      const branchName = parsed.data.name;

      const shouldUsePrefs =
        process.env.RT_PG_PREFS === 'true' || process.env.RT_PG_READ === 'true' || process.env.RT_PG_SHADOW_WRITE === 'true';
      if (shouldUsePrefs) {
        try {
          const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
          const { rtSetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
          await rtCreateProjectShadow({ projectId: project.id, name: project.name, description: project.description });
          await rtSetCurrentRefShadowV1({ projectId: project.id, refName: branchName });
        } catch (error) {
          console.error('[pg-prefs] Failed to set current branch', error);
        }
      }

      return Response.json({ branchName, branches }, { status: 201 });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireUser();
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const body = await request.json().catch(() => null);
    const parsed = switchBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    return await withProjectLock(project.id, async () => {
      const branches = await listBranches(project.id);
      const exists = branches.some((b) => b.name === parsed.data.name);
      if (!exists) {
        throw badRequest(`Branch ${parsed.data.name} does not exist`);
      }

      const shouldUsePrefs =
        process.env.RT_PG_PREFS === 'true' || process.env.RT_PG_READ === 'true' || process.env.RT_PG_SHADOW_WRITE === 'true';
      if (shouldUsePrefs) {
        try {
          const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
          const { rtSetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
          await rtCreateProjectShadow({ projectId: project.id, name: project.name, description: project.description });
          await rtSetCurrentRefShadowV1({ projectId: project.id, refName: parsed.data.name });
        } catch (error) {
          console.error('[pg-prefs] Failed to set current branch', error);
          await switchBranch(project.id, parsed.data.name);
        }
      } else {
        await switchBranch(project.id, parsed.data.name);
      }
      const updatedBranches = await listBranches(project.id);
      const branchName = parsed.data.name;
      return Response.json({ branchName, branches: updatedBranches });
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
