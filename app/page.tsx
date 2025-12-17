import { listProjects } from '@git/projects';
import { getNodes } from '@git/nodes';
import { HomePageContent } from '@/src/components/home/HomePageContent';

export default async function HomePage() {
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

  return <HomePageContent projects={projectsWithCounts} />;
}
