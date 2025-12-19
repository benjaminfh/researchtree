import { initProject, listProjects } from '@git/projects';
import { createProjectSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';

export async function GET() {
  try {
    await requireUser();
    const projects = await listProjects();
    return Response.json({ projects });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await request.json().catch(() => null);
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }
    const project = await initProject(parsed.data.name, parsed.data.description);
    return Response.json(project, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
