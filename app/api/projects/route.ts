// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { createProjectSchema } from '@/src/server/schemas';
import { badRequest, handleRouteError } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { getDefaultModelForProvider, resolveLLMProvider, resolveOpenAIProviderSelection } from '@/src/server/llm';

export async function GET() {
  try {
    const user = await requireUser();
    const store = getStoreConfig();

    if (store.mode === 'pg') {
      const { rtListProjectsShadowV1 } = await import('@/src/store/pg/projects');
      const projects = (await rtListProjectsShadowV1()).map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
        createdAt: project.createdAt
      }));
      return Response.json({ projects });
    }

    const { listProjects } = await import('@git/projects');
    const projects = await listProjects();

    const { rtListProjectMemberIdsShadowV1 } = await import('@/src/store/pg/members');
    const memberIds = await rtListProjectMemberIdsShadowV1({ userId: user.id });
    const allowed = new Set(memberIds);
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

    const requestedProvider = resolveOpenAIProviderSelection(parsed.data.provider ?? null);
    const defaultProvider = resolveLLMProvider(requestedProvider);
    const defaultModel = getDefaultModelForProvider(defaultProvider);

    if (store.mode === 'pg') {
      const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
      const created = await rtCreateProjectShadow({
        name: parsed.data.name,
        description: parsed.data.description,
        provider: defaultProvider,
        model: defaultModel
      });
      const { rtGetProjectShadowV1 } = await import('@/src/store/pg/projects');
      const data = await rtGetProjectShadowV1({ projectId: created.projectId });
      if (!data) {
        throw new Error('Project creation failed');
      }
      return Response.json(
        {
          id: data.id,
          name: data.name,
          description: data.description ?? undefined,
          createdAt: data.createdAt
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
