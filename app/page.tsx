import { listProjects } from '@git/projects';
import { getNodes } from '@git/nodes';
import { CreateProjectForm } from '@/src/components/projects/CreateProjectForm';
import { ProjectsList } from '@/src/components/projects/ProjectsList';

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

      <ProjectsList projects={projectsWithCounts} />
    </main>
  );
}
