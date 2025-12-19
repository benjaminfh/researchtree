import { initProject, listProjects } from '@git/projects';
import { createProjectSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { createSupabaseServerClient } from '@/src/server/supabase/server';

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await listProjects();

    try {
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase.from('project_members').select('project_id').eq('user_id', user.id);
      if (error) {
        throw new Error(error.message);
      }
      const allowed = new Set((data ?? []).map((row) => String((row as any).project_id)));
      const filtered = projects.filter((p) => allowed.has(p.id));
      return Response.json({ projects: filtered });
    } catch {
      // In test/local scenarios without Supabase configured, fall back to the on-disk list.
      return Response.json({ projects });
    }
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

    try {
      const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
      await rtCreateProjectShadow({ projectId: project.id, name: project.name, description: project.description });
    } catch (error) {
      console.error('[pg] Failed to create project row', error);
    }

    return Response.json(project, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
