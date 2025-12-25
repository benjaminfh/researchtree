import { createProjectSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { getStoreConfig } from '@/src/server/storeConfig';
import { getDefaultModelForProvider, resolveLLMProvider } from '@/src/server/llm';

export async function GET() {
  try {
    const user = await requireUser();
    const store = getStoreConfig();

    if (store.mode === 'pg') {
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase
        .from('projects')
        .select('id,name,description,created_at')
        .order('updated_at', { ascending: false });
      if (error) {
        throw new Error(error.message);
      }
      const projects = (data ?? []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name),
        description: row.description ?? undefined,
        createdAt: new Date(row.created_at).toISOString()
      }));
      return Response.json({ projects });
    }

    const { listProjects } = await import('@git/projects');
    const projects = await listProjects();

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.from('project_members').select('project_id').eq('user_id', user.id);
    if (error) {
      throw new Error(error.message);
    }
    const allowed = new Set((data ?? []).map((row) => String((row as any).project_id)));
    const filtered = projects.filter((p) => allowed.has(p.id));
    return Response.json({ projects: filtered });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser();
    const store = getStoreConfig();
    const body = await request.json().catch(() => null);
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest('Invalid request body', { issues: parsed.error.flatten() });
    }

    const defaultProvider = resolveLLMProvider(parsed.data.provider);
    const defaultModel = getDefaultModelForProvider(defaultProvider);

    if (store.mode === 'pg') {
      const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
      const created = await rtCreateProjectShadow({
        name: parsed.data.name,
        description: parsed.data.description,
        provider: defaultProvider,
        model: defaultModel
      });
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase
        .from('projects')
        .select('id,name,description,created_at')
        .eq('id', created.projectId)
        .single();
      if (error) {
        throw new Error(error.message);
      }
      return Response.json(
        {
          id: String((data as any).id),
          name: String((data as any).name),
          description: (data as any).description ?? undefined,
          createdAt: new Date((data as any).created_at).toISOString()
        },
        { status: 201 }
      );
    }

    const { initProject, deleteProject } = await import('@git/projects');
    const project = await initProject(parsed.data.name, parsed.data.description, defaultProvider);

    try {
      const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
      await rtCreateProjectShadow({
        projectId: project.id,
        name: project.name,
        description: project.description,
        provider: defaultProvider,
        model: defaultModel
      });
    } catch (error) {
      await deleteProject(project.id).catch(() => undefined);
      throw error;
    }

    return Response.json(project, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
