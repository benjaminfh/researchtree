import { forbidden } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';

export interface ProjectForAuthz {
  id: string;
  name?: string | null;
  description?: string | null;
}

export async function requireProjectAccess(project: ProjectForAuthz): Promise<void> {
  await requireUser();
  try {
    const { rtCreateProjectShadow } = await import('@/src/store/pg/projects');
    await rtCreateProjectShadow({
      projectId: project.id,
      name: project.name ?? 'Untitled',
      description: project.description ?? undefined
    });
  } catch (error) {
    const message = (error as Error)?.message ?? 'Not authorized';
    if (message.toLowerCase().includes('not authorized')) {
      throw forbidden('Not authorized');
    }
    throw error;
  }
}

