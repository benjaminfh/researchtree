import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@git/projects';
import { listBranches } from '@git/branches';
import { WorkspaceClient } from '@/src/components/workspace/WorkspaceClient';
import { resolveLLMProvider, getDefaultModelForProvider } from '@/src/server/llm';

interface ProjectPageProps {
  params: {
    id: string;
  };
}

export default async function ProjectWorkspace({ params }: ProjectPageProps) {
  const project = await getProject(params.id);
  if (!project) {
    notFound();
  }
  const branches = await listBranches(params.id);

  const providerOptions = (['openai', 'gemini', 'mock'] as const).map((id) => ({
    id,
    label: id === 'openai' ? 'OpenAI' : id === 'gemini' ? 'Gemini' : 'Mock',
    defaultModel: getDefaultModelForProvider(id)
  }));

  return (
    <main style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ textDecoration: 'none', color: '#111', fontWeight: 600 }}>
          ← Home
        </Link>
      </div>
      <WorkspaceClient project={project} initialBranches={branches} defaultProvider={resolveLLMProvider()} providerOptions={providerOptions} />
    </main>
  );
}
