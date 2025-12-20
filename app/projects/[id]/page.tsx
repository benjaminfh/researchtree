import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkspaceClient } from '@/src/components/workspace/WorkspaceClient';
import { resolveLLMProvider, getDefaultModelForProvider, type LLMProvider } from '@/src/server/llm';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireUser } from '@/src/server/auth';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { getEnabledProviders } from '@/src/server/llmConfig';

interface ProjectPageProps {
  params: {
    id: string;
  };
}

export default async function ProjectWorkspace({ params }: ProjectPageProps) {
  const store = getStoreConfig();

  let project: { id: string; name: string; description?: string; createdAt: string; branchName?: string };
  let branches: any[];

  if (store.mode === 'pg') {
    await requireUser();
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,description,created_at')
      .eq('id', params.id)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      notFound();
    }

    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    const { rtListRefsShadowV1 } = await import('@/src/store/pg/reads');
    const current = await rtGetCurrentRefShadowV1({ projectId: params.id, defaultRefName: 'main' }).catch(() => ({
      refName: 'main'
    }));

    project = {
      id: String((data as any).id),
      name: String((data as any).name),
      description: (data as any).description ?? undefined,
      createdAt: new Date((data as any).created_at).toISOString(),
      branchName: current.refName
    };
    branches = await rtListRefsShadowV1({ projectId: params.id });
  } else {
    const { getProject } = await import('@git/projects');
    const { listBranches } = await import('@git/branches');
    const gitProject = await getProject(params.id);
    if (!gitProject) {
      notFound();
    }
    project = gitProject;
    branches = await listBranches(params.id);
  }

  const labelForProvider = (id: LLMProvider) => {
    if (id === 'openai') return 'OpenAI';
    if (id === 'gemini') return 'Gemini';
    if (id === 'anthropic') return 'Anthropic';
    return 'Mock';
  };

  const providerOptions = getEnabledProviders().map((id) => ({
    id,
    label: labelForProvider(id),
    defaultModel: getDefaultModelForProvider(id)
  }));

  return (
    <main className="min-h-screen bg-white">
      <WorkspaceClient
        project={project}
        initialBranches={branches}
        defaultProvider={resolveLLMProvider()}
        providerOptions={providerOptions}
      />
    </main>
  );
}
