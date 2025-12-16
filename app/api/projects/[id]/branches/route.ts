import { createBranch, listBranches, switchBranch } from '@git/branches';
import { getProject } from '@git/projects';
import { handleRouteError, notFound, badRequest } from '@/src/server/http';
import { createBranchSchema, switchBranchSchema } from '@/src/server/schemas';
import { getCurrentBranchName } from '@git/utils';

interface RouteContext {
  params: { id: string };
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const branches = await listBranches(project.id);
    const currentBranch = await getCurrentBranchName(project.id);
    return Response.json({ branches, currentBranch });
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
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    await createBranch(project.id, parsed.data.name, parsed.data.fromRef);
    const branches = await listBranches(project.id);
    const branchName = await getCurrentBranchName(project.id);
    return Response.json({ branchName, branches }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const project = await getProject(params.id);
    if (!project) {
      throw notFound('Project not found');
    }
    const body = await request.json().catch(() => null);
    const parsed = switchBranchSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    await switchBranch(project.id, parsed.data.name);
    const branches = await listBranches(project.id);
    const branchName = await getCurrentBranchName(project.id);
    return Response.json({ branchName, branches });
  } catch (error) {
    return handleRouteError(error);
  }
}
