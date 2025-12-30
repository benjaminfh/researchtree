// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { HomePageContent } from '@/src/components/home/HomePageContent';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { resolveLLMProvider, type LLMProvider } from '@/src/server/llm';
import { getEnabledProviders } from '@/src/server/llmConfig';

export const runtime = 'nodejs';

export default async function HomePage() {
  const store = getStoreConfig();
  const normalizeProviderForUi = (provider: LLMProvider) => (provider === 'openai_responses' ? 'openai' : provider);
  const labelForProvider = (id: LLMProvider) => {
    if (id === 'openai' || id === 'openai_responses') return 'OpenAI';
    if (id === 'gemini') return 'Gemini';
    if (id === 'anthropic') return 'Anthropic';
    return 'Mock';
  };
  const providerOptions = (() => {
    const entries = new Map<LLMProvider, { id: LLMProvider; label: string }>();
    for (const provider of getEnabledProviders()) {
      const normalized = normalizeProviderForUi(provider);
      if (!entries.has(normalized)) {
        entries.set(normalized, { id: normalized, label: labelForProvider(normalized) });
      }
    }
    return Array.from(entries.values());
  })();
  const defaultProvider = normalizeProviderForUi(resolveLLMProvider());

  if (store.mode === 'pg') {
    await requireUser();
    const { rtListProjectsShadowV1 } = await import('@/src/store/pg/projects');
    const { rtGetProjectMainRefUpdatesShadowV1, rtListRefsShadowV1 } = await import('@/src/store/pg/reads');
    const rows = await rtListProjectsShadowV1();
    const projectIds = rows.map((row) => row.id);

    const mainRefUpdatedAtByProject = new Map<string, string>();
    if (projectIds.length > 0) {
      const refRows = await rtGetProjectMainRefUpdatesShadowV1({ projectIds });
      for (const refRow of refRows) {
        mainRefUpdatedAtByProject.set(refRow.projectId, refRow.updatedAt);
      }
    }
    const projectsWithCounts = await Promise.all(
      rows.map(async (row) => {
        const projectId = row.id;
        const createdAt = row.createdAt;

        let nodeCount = 0;
        try {
          const refs = await rtListRefsShadowV1({ projectId });
          nodeCount = refs.find((ref) => ref.name === 'main')?.nodeCount ?? 0;
        } catch {
          nodeCount = 0;
        }

        const lastModifiedSource = mainRefUpdatedAtByProject.get(projectId) ?? row.updatedAt ?? row.createdAt;
        const lastModified = Number.isFinite(Date.parse(lastModifiedSource))
          ? new Date(lastModifiedSource).getTime()
          : new Date(createdAt).getTime();

        return {
          id: projectId,
          name: row.name,
          description: row.description ?? undefined,
          createdAt,
          nodeCount,
          lastModified
        };
      })
    );

    projectsWithCounts.sort((a, b) => b.lastModified - a.lastModified);
    return (
      <main className="min-h-screen bg-white">
        <HomePageContent
          projects={projectsWithCounts}
          providerOptions={providerOptions}
          defaultProvider={defaultProvider}
        />
      </main>
    );
  }

  const { listProjects } = await import('@git/projects');
  const { getNodes } = await import('@git/nodes');
  const projects = await listProjects();
  const projectsWithCounts = await Promise.all(
    projects.map(async (project) => {
      const nodes = await getNodes(project.id);
      const latestNodeTimestamp = nodes.reduce((latest, node) => Math.max(latest, node.timestamp ?? 0), 0);
      const lastModified = nodes.length > 0 ? latestNodeTimestamp : new Date(project.createdAt).getTime();
      return { ...project, nodeCount: nodes.length, lastModified };
    })
  );
  projectsWithCounts.sort((a, b) => b.lastModified - a.lastModified);

  return (
    <main className="min-h-screen bg-white">
      <HomePageContent projects={projectsWithCounts} providerOptions={providerOptions} defaultProvider={defaultProvider} />
    </main>
  );
}
