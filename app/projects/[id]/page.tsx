// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WorkspaceClient } from '@/src/components/workspace/WorkspaceClient';
import { APP_NAME } from '@/src/config/app';
import { resolveOpenAIProviderSelection, getDefaultModelForProvider, type LLMProvider } from '@/src/server/llm';
import { getStoreConfig } from '@/src/server/storeConfig';
import { requireUser } from '@/src/server/auth';
import { getEnabledProviders, getOpenAIUseResponses } from '@/src/server/llmConfig';

export const runtime = 'nodejs';

interface ProjectPageProps {
  params: {
    id: string;
  };
}

type WorkspaceProject = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  branchName?: string;
  isOwner?: boolean;
};

type WorkspaceData = {
  project: WorkspaceProject;
  branches: any[];
  storeMode: ReturnType<typeof getStoreConfig>['mode'];
};

type WorkspaceMetadata = {
  project: WorkspaceProject;
};

async function loadWorkspaceBase(
  projectId: string,
  refFallback: string
): Promise<WorkspaceMetadata & { storeMode: WorkspaceData['storeMode'] }> {
  const store = getStoreConfig();

  let project: WorkspaceProject;

  if (store.mode === 'pg') {
    const user = await requireUser();
    const { rtGetProjectShadowV1, rtGetProjectOwnerShadowV1 } = await import('@/src/store/pg/projects');
    const data = await rtGetProjectShadowV1({ projectId });
    if (!data) {
      notFound();
    }

    const ownerUserId = await rtGetProjectOwnerShadowV1({ projectId });
    const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
    const current = await rtGetCurrentRefShadowV2({ projectId, defaultRefName: 'main' }).catch(() => ({
      refId: null,
      refName: refFallback
    }));

    project = {
      id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      createdAt: data.createdAt,
      branchName: current.refName,
      isOwner: ownerUserId === user.id
    };
  } else {
    const { getProject } = await import('@git/projects');
    const gitProject = await getProject(projectId);
    if (!gitProject) {
      notFound();
    }
    project = gitProject;
  }

  return { project, storeMode: store.mode };
}

async function loadWorkspaceData(projectId: string): Promise<WorkspaceData> {
  const { project, storeMode } = await loadWorkspaceBase(projectId, 'main');

  let branches: any[];

  if (storeMode === 'pg') {
    const { rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
    branches = await rtListRefsShadowV2({ projectId });
  } else {
    const { listBranches } = await import('@git/branches');
    branches = await listBranches(projectId);
  }

  return { project, branches, storeMode };
}

async function loadWorkspaceMetadata(projectId: string): Promise<WorkspaceMetadata> {
  const { project } = await loadWorkspaceBase(projectId, '[unknown]');

  return { project };
}

function formatWorkspaceTitle(project: WorkspaceProject): string {
  const branchName = project.branchName?.trim() || '[unknown]';
  return `${APP_NAME} | ${project.name} | ${branchName}`;
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { project } = await loadWorkspaceMetadata(params.id);

  return {
    title: formatWorkspaceTitle(project)
  };
}

export default async function ProjectWorkspace({ params }: ProjectPageProps) {
  const { project, branches, storeMode } = await loadWorkspaceData(params.id);

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
        storeMode={storeMode}
      />
    </main>
  );
}
