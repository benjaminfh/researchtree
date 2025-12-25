import { HomePageContent } from '@/src/components/home/HomePageContent';
import { requireUser } from '@/src/server/auth';
import { getStoreConfig } from '@/src/server/storeConfig';
import { createSupabaseServerClient } from '@/src/server/supabase/server';
import { resolveLLMProvider, type LLMProvider } from '@/src/server/llm';
import { getEnabledProviders } from '@/src/server/llmConfig';

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
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,description,created_at,updated_at')
      .order('updated_at', { ascending: false });
    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as any[];
    const projectIds = rows.map((row) => String(row.id));

    const mainRefUpdatedAtByProject = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: refRows, error: refError } = await supabase
        .from('refs')
        .select('project_id,updated_at')
        .eq('name', 'main')
        .in('project_id', projectIds);
      if (refError) {
        throw new Error(refError.message);
      }
      for (const refRow of (refRows ?? []) as any[]) {
        mainRefUpdatedAtByProject.set(String(refRow.project_id), String(refRow.updated_at));
      }
    }

    const { rtListRefsShadowV1 } = await import('@/src/store/pg/reads');
    const projectsWithCounts = await Promise.all(
      rows.map(async (row) => {
        const projectId = String(row.id);
        const createdAt = new Date(row.created_at).toISOString();

        let nodeCount = 0;
        try {
          const refs = await rtListRefsShadowV1({ projectId });
          nodeCount = refs.find((ref) => ref.name === 'main')?.nodeCount ?? 0;
        } catch {
          nodeCount = 0;
        }

        const lastModifiedSource = mainRefUpdatedAtByProject.get(projectId) ?? String(row.updated_at ?? row.created_at);
        const lastModified = Number.isFinite(Date.parse(lastModifiedSource))
          ? new Date(lastModifiedSource).getTime()
          : new Date(createdAt).getTime();

        return {
          id: projectId,
          name: String(row.name),
          description: row.description ?? undefined,
          createdAt,
          nodeCount,
          lastModified
        };
      })
    );

    projectsWithCounts.sort((a, b) => b.lastModified - a.lastModified);
    return (
      <HomePageContent
        projects={projectsWithCounts}
        providerOptions={providerOptions}
        defaultProvider={defaultProvider}
      />
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
    <HomePageContent projects={projectsWithCounts} providerOptions={providerOptions} defaultProvider={defaultProvider} />
  );
}
