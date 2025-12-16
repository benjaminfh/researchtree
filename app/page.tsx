import Link from 'next/link';
import { listProjects } from '@git/projects';
import { getNodes } from '@git/nodes';
import { CreateProjectForm } from '@/src/components/projects/CreateProjectForm';

export default async function HomePage() {
  const projects = await listProjects();
  const projectsWithCounts = await Promise.all(
    projects.map(async (project) => {
      const nodes = await getNodes(project.id);
      return { ...project, nodeCount: nodes.length };
    })
  );

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1>ResearchTree Projects</h1>
        <p>Git-backed reasoning sessions.</p>
      </header>

      <CreateProjectForm />

      {projectsWithCounts.length === 0 ? (
        <section style={{ padding: '2rem', border: '1px dashed #c3cad5', borderRadius: '1rem' }}>
          <p>No projects yet. Create one to get started.</p>
        </section>
      ) : (
        <ul style={{ display: 'grid', gap: '1rem', listStyle: 'none', padding: 0 }}>
          {projectsWithCounts.map((project) => (
            <li key={project.id} style={{ border: '1px solid #e1e7ef', borderRadius: '0.75rem', padding: '1rem' }}>
              <h2 style={{ margin: '0 0 0.5rem' }}>{project.name}</h2>
              <p style={{ margin: '0 0 1rem', color: '#5f6b7c' }}>
                Created {new Date(project.createdAt).toLocaleString()} · Branch {project.branchName ?? 'main'} · Nodes {project.nodeCount}
              </p>
              <Link href={`/projects/${project.id}`} style={{ fontWeight: 600 }}>
                Open workspace →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
