import { forbidden } from '@/src/server/http';
import { requireUser } from '@/src/server/auth';
import { createSupabaseServerClient } from '@/src/server/supabase/server';

export interface ProjectForAuthz {
  id: string;
  name?: string | null;
  description?: string | null;
}

export async function requireProjectAccess(project: ProjectForAuthz): Promise<void> {
  await requireUser();
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from('projects').select('id').eq('id', project.id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw forbidden('Not authorized');
  }
}
