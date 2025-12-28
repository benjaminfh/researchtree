import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WorkspaceClient } from '@/src/components/workspace/WorkspaceClient';
import { resolveOpenAIProviderSelection, getDefaultModelForProvider, type LLMProvider } from '@/src/server/llm';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireUser } from '@/src/server/auth';
import { getEnabledProviders, getOpenAIUseResponses } from '@/src/server/llmConfig';

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
    const { rtGetProjectShadowV1 } = await import('@/src/store/pg/projects');
    const data = await rtGetProjectShadowV1({ projectId: params.id });
    if (!data) {
      notFound();
    }

    const { rtGetCurrentRefShadowV1 } = await import('@/src/store/pg/prefs');
    const { rtListRefsShadowV1 } = await import('@/src/store/pg/reads');
    const current = await rtGetCurrentRefShadowV1({ projectId: params.id, defaultRefName: 'main' }).catch(() => ({
      refName: 'main'
    }));

    project = {
      id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      createdAt: data.createdAt,
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
    if (id === 'openai' || id === 'openai_responses') return 'OpenAI';
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
        defaultProvider={resolveOpenAIProviderSelection()}
        providerOptions={providerOptions}
        openAIUseResponses={getOpenAIUseResponses()}
      />
    </main>
  );
}
